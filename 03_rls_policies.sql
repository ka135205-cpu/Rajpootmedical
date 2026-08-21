-- ============================================================================
-- RAJPUT MEDICAL STORE — ROW LEVEL SECURITY (Phase 2)
-- Run after 02_schema.sql
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (used inside policies — SECURITY DEFINER so they can read
-- user_roles/profiles regardless of the calling row's own RLS)
-- ============================================================================

-- The store_id the current authenticated user belongs to.
-- (MVP: one store per user. If a user ever needs multiple stores, this becomes
--  a parameterized lookup instead of "first match" — flagged in decisions doc.)
create or replace function current_store_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select store_id from user_roles where user_id = auth.uid() limit 1;
$$;

-- The current user's role within their store.
create or replace function current_user_role()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid() limit 1;
$$;

create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select current_user_role() = 'owner'; $$;

create or replace function is_inventory_manager_or_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select current_user_role() in ('owner', 'inventory_manager'); $$;

create or replace function is_cashier_or_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select current_user_role() in ('owner', 'cashier'); $$;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

alter table stores enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table store_settings enable row level security;
alter table categories enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table product_batches enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table supplier_payments enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table returns enable row level security;
alter table return_items enable row level security;
alter table expenses enable row level security;
alter table stock_movements enable row level security;
alter table audit_logs enable row level security;

-- ============================================================================
-- STORES — a user can see/update only their own store
-- ============================================================================

create policy stores_select on stores
  for select using (id = current_store_id());

create policy stores_update on stores
  for update using (id = current_store_id() and is_owner());

-- Insert happens once, at sign-up, via a trusted Route Handler using the
-- user's own session immediately after auth — allowed for any authenticated
-- user who does NOT yet have a user_roles row (first-time store creation only).
create policy stores_insert_first_time on stores
  for insert with check (
    not exists (select 1 from user_roles where user_id = auth.uid())
  );

-- ============================================================================
-- PROFILES — user can see profiles within their store; edit only their own
-- ============================================================================

create policy profiles_select_same_store on profiles
  for select using (
    id = auth.uid()
    or id in (select user_id from user_roles where store_id = current_store_id())
  );

create policy profiles_update_own on profiles
  for update using (id = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- ============================================================================
-- USER_ROLES — only owner manages roles; everyone can read roles in their store
-- ============================================================================

create policy user_roles_select on user_roles
  for select using (store_id = current_store_id());

create policy user_roles_insert_owner on user_roles
  for insert with check (
    -- allow the very first role row (store creation) OR owner inviting someone
    (store_id = current_store_id() and is_owner())
    or not exists (select 1 from user_roles ur where ur.user_id = auth.uid())
  );

create policy user_roles_update_owner on user_roles
  for update using (store_id = current_store_id() and is_owner());

create policy user_roles_delete_owner on user_roles
  for delete using (store_id = current_store_id() and is_owner());

-- ============================================================================
-- STORE_SETTINGS — read by all roles, write by owner only
-- ============================================================================

create policy store_settings_select on store_settings
  for select using (store_id = current_store_id());

create policy store_settings_update_owner on store_settings
  for update using (store_id = current_store_id() and is_owner());

create policy store_settings_insert_owner on store_settings
  for insert with check (store_id = current_store_id() and is_owner());

-- ============================================================================
-- CATEGORIES — read all, write inventory_manager/owner
-- ============================================================================

create policy categories_select on categories
  for select using (store_id = current_store_id());

create policy categories_write on categories
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- SUPPLIERS — read/write inventory_manager/owner; cashier: no access
-- ============================================================================

create policy suppliers_select on suppliers
  for select using (store_id = current_store_id() and is_inventory_manager_or_owner());

create policy suppliers_write on suppliers
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- CUSTOMERS — read by all roles (cashier needs to select at POS), write by
-- owner/cashier (cashier can create a customer at point of sale)
-- ============================================================================

create policy customers_select on customers
  for select using (store_id = current_store_id());

create policy customers_write on customers
  for all using (store_id = current_store_id() and is_cashier_or_owner())
  with check (store_id = current_store_id() and is_cashier_or_owner());

-- ============================================================================
-- PRODUCTS — read by all roles; write by inventory_manager/owner
-- ============================================================================

create policy products_select on products
  for select using (store_id = current_store_id());

create policy products_write on products
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- PRODUCT_BATCHES — read by all roles (needed at POS); direct write restricted
-- (normal stock changes happen through RPC functions below, which run as
-- SECURITY DEFINER and bypass RLS internally — these policies cover any
-- direct table access, e.g. manual correction by inventory manager)
-- ============================================================================

create policy batches_select on product_batches
  for select using (store_id = current_store_id());

create policy batches_write on product_batches
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- PURCHASES / PURCHASE_ITEMS / SUPPLIER_PAYMENTS — inventory_manager/owner only
-- ============================================================================

create policy purchases_select on purchases
  for select using (store_id = current_store_id() and is_inventory_manager_or_owner());

create policy purchases_write on purchases
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

create policy purchase_items_select on purchase_items
  for select using (
    purchase_id in (select id from purchases where store_id = current_store_id())
    and is_inventory_manager_or_owner()
  );

create policy purchase_items_write on purchase_items
  for all using (
    purchase_id in (select id from purchases where store_id = current_store_id())
    and is_inventory_manager_or_owner()
  )
  with check (
    purchase_id in (select id from purchases where store_id = current_store_id())
    and is_inventory_manager_or_owner()
  );

create policy supplier_payments_select on supplier_payments
  for select using (store_id = current_store_id() and is_inventory_manager_or_owner());

create policy supplier_payments_write on supplier_payments
  for all using (store_id = current_store_id() and is_inventory_manager_or_owner())
  with check (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- SALES / SALE_ITEMS — cashier/owner create; cashier sees own sales, owner sees all
-- ============================================================================

create policy sales_select on sales
  for select using (
    store_id = current_store_id()
    and (is_owner() or (is_cashier_or_owner() and cashier_id = auth.uid()))
  );

create policy sales_insert on sales
  for insert with check (store_id = current_store_id() and is_cashier_or_owner());

-- Sales are otherwise immutable from the client (no update/delete policy) —
-- corrections happen only via the process_return RPC, never a raw UPDATE,
-- to preserve financial history integrity.

create policy sale_items_select on sale_items
  for select using (
    sale_id in (
      select id from sales
      where store_id = current_store_id()
        and (is_owner() or cashier_id = auth.uid())
    )
  );

-- sale_items has no direct insert policy for regular users: rows are created
-- only by the process_sale() SECURITY DEFINER function.

-- ============================================================================
-- PAYMENTS — cashier/owner read/create for sales they can see
-- ============================================================================

create policy payments_select on payments
  for select using (
    store_id = current_store_id()
    and (is_owner() or created_by = auth.uid())
  );

create policy payments_insert on payments
  for insert with check (store_id = current_store_id() and is_cashier_or_owner());

-- ============================================================================
-- RETURNS / RETURN_ITEMS — owner + cashier (processing a return at the counter)
-- ============================================================================

create policy returns_select on returns
  for select using (store_id = current_store_id() and is_cashier_or_owner());

create policy returns_insert on returns
  for insert with check (store_id = current_store_id() and is_cashier_or_owner());

create policy return_items_select on return_items
  for select using (
    return_id in (select id from returns where store_id = current_store_id())
    and is_cashier_or_owner()
  );

-- return_items rows are created only by process_return() RPC.

-- ============================================================================
-- EXPENSES — owner only
-- ============================================================================

create policy expenses_select on expenses
  for select using (store_id = current_store_id() and is_owner());

create policy expenses_write on expenses
  for all using (store_id = current_store_id() and is_owner())
  with check (store_id = current_store_id() and is_owner());

-- ============================================================================
-- STOCK_MOVEMENTS — read-only ledger for inventory_manager/owner; cashier can
-- view movements only for products (no write policy — RPCs insert only)
-- ============================================================================

create policy stock_movements_select on stock_movements
  for select using (store_id = current_store_id() and is_inventory_manager_or_owner());

-- ============================================================================
-- AUDIT_LOGS — owner only
-- ============================================================================

create policy audit_logs_select on audit_logs
  for select using (store_id = current_store_id() and is_owner());

-- No insert/update/delete policies for audit_logs from client roles at all —
-- only the generic trigger function (SECURITY DEFINER) writes to this table.

-- ============================================================================
-- STORAGE (store logo bucket) — create bucket via Supabase dashboard/CLI, then:
-- ============================================================================

-- insert into storage.buckets (id, name, public) values ('store-assets', 'store-assets', true);
--
-- create policy "store logo read" on storage.objects for select
--   using (bucket_id = 'store-assets');
--
-- create policy "store logo write" on storage.objects for insert
--   with check (bucket_id = 'store-assets' and is_owner());

-- ============================================================================
-- END OF RLS FILE
-- Next: 04_functions_triggers.sql
-- ============================================================================
