-- ============================================================================
-- RAJPUT MEDICAL STORE — PHASE 3 SCHEMA & RLS UPDATES
-- Run AFTER 02_schema.sql, 03_rls_policies.sql, 04_functions_triggers.sql
-- have already been applied. This migration implements the confirmed
-- business decisions (see 05_DECISIONS_NEEDED.md responses).
--
-- ASSUMPTION: applied before any real production data exists (fresh Phase 2
-- → Phase 3 handoff). If your project already has live sales, the
-- invoice_number column change below needs a backfill step first — Claude
-- Code should check `select count(*) from sales` before running this and
-- pause for a backfill script if the count is > 0.
-- ============================================================================

-- ============================================================================
-- DECISION #1 — ROLES: owner + cashier only, inventory_manager retired
--
-- The `user_role` enum keeps the `inventory_manager` value (Postgres cannot
-- cheaply drop an enum value), but it is no longer assigned by the app and
-- no policy grants it any privilege beyond what `cashier` already has. This
-- is intentionally non-destructive: if you want a real Inventory Manager
-- role again later, re-activate it by granting it the relevant policies
-- again — no schema rebuild required, exactly per Decision #11.
-- ============================================================================

create or replace function is_inventory_manager_or_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select is_owner(); $$;  -- collapsed: owner-only now, inventory_manager retired

-- Tighten batches/suppliers/purchases/expenses to owner-only writes (cashier
-- was already excluded; this just removes the now-unused manager tier).
-- (No policy DDL changes needed here since suppliers_write/purchases_write/
--  batches_write/expenses_write already call is_inventory_manager_or_owner(),
--  which now resolves to owner-only via the function redefinition above.)

-- ============================================================================
-- DECISION #4 — Cashier must NEVER see cost price or profit.
--
-- RLS is row-level only; column-level masking requires either (a) separate
-- Postgres roles per app-role (not how Supabase's single `authenticated`
-- role works) or (b) masking views + revoking direct table SELECT. We use
-- (b): revoke SELECT on the sensitive base tables from `authenticated` and
-- expose masked views instead. Owner sees real numbers via the same view
-- (CASE expression checks is_owner()); cashier gets NULL for cost/profit
-- columns. Writes are unaffected — they still go through RPC functions or
-- the existing owner-only RLS-gated direct writes.
-- ============================================================================

revoke select on product_batches from authenticated;
revoke select on sale_items from authenticated;

create view product_batches_pos_view
  with (security_invoker = true)
as
select
  b.id,
  b.store_id,
  b.product_id,
  b.supplier_id,
  b.batch_number,
  b.quantity,
  case when is_owner() then b.purchase_price else null end as purchase_price,
  b.selling_price,
  b.expiry_date,
  b.received_date,
  b.created_at,
  b.updated_at
from product_batches b
where b.store_id = current_store_id();

grant select on product_batches_pos_view to authenticated;

create view sale_items_detail_view
  with (security_invoker = true)
as
select
  si.id,
  si.sale_id,
  si.product_id,
  si.batch_id,
  si.quantity,
  si.unit_price,
  case when is_owner() then si.unit_cost else null end as unit_cost,
  si.discount,
  si.line_total,
  case when is_owner() then si.line_profit else null end as line_profit,
  si.created_at
from sale_items si
join sales s on s.id = si.sale_id
where s.store_id = current_store_id()
  and (is_owner() or s.cashier_id = auth.uid());

grant select on sale_items_detail_view to authenticated;

-- Owner-only write access to product_batches remains via direct RLS
-- (unchanged from 03_rls_policies.sql — batches_write already checked
-- is_inventory_manager_or_owner(), which is now owner-only). Cashier gets
-- zero direct table access to product_batches; all cashier reads for POS
-- must go through product_batches_pos_view or the process_sale RPC.

-- ============================================================================
-- DECISION #10 — Invoice numbering format: RMS-YYYY-NNNNNN, resets per year,
-- concurrency-safe, server-generated only.
-- ============================================================================

alter table store_settings
  add column if not exists invoice_seq_year integer not null default extract(year from current_date)::int,
  add column if not exists invoice_seq_number integer not null default 0;

-- next_invoice_number (old, plain-integer scheme) is superseded; drop it
-- only if no data depends on it yet.
alter table store_settings drop column if exists next_invoice_number;

-- sales.invoice_number changes from integer to formatted text.
alter table sales drop constraint if exists sales_store_id_invoice_number_key;
alter table sales alter column invoice_number type text using
  ('RMS-' || extract(year from created_at)::text || '-' || lpad(invoice_number::text, 6, '0'));
alter table sales add constraint sales_store_id_invoice_number_key unique (store_id, invoice_number);

-- ============================================================================
-- DECISION #2 — OFFLINE SALES: idempotent sync support.
--
-- Each offline-created sale gets a client-generated UUID (client_transaction_id)
-- at the moment it's added to the local queue. On sync, process_sale() is
-- called with this id; if a sale with that client_transaction_id already
-- exists for the store, the function returns the existing sale_id instead of
-- reprocessing — this is what makes "sync twice" (e.g. retry after a flaky
-- network response) safe. See 09_OFFLINE_SYNC_ARCHITECTURE.md for the full
-- client-side design and conflict-handling policy.
-- ============================================================================

alter table sales
  add column if not exists client_transaction_id uuid,
  add column if not exists synced_from_offline boolean not null default false;

create unique index if not exists idx_sales_client_txn
  on sales(store_id, client_transaction_id)
  where client_transaction_id is not null;

-- ============================================================================
-- DECISION #8 — RETURNS: cashier can initiate, owner must approve before
-- stock is restocked / refund is finalized. Owner-initiated returns are
-- auto-approved (no workflow friction for the person who owns the decision
-- anyway).
-- ============================================================================

alter table returns
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references profiles(id),
  add column if not exists approved_at timestamptz;

create policy returns_update_owner_approval on returns
  for update using (store_id = current_store_id() and is_owner())
  with check (store_id = current_store_id() and is_owner());

-- ============================================================================
-- END OF PHASE 3 SCHEMA/RLS UPDATES
-- Next: 07_phase3_functions_updates.sql (process_sale idempotency + new
-- invoice format, process_return → pending/approve_return split)
-- ============================================================================
