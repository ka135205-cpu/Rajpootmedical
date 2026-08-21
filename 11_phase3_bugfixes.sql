-- ============================================================================
-- RAJPUT MEDICAL STORE — BUGFIX MIGRATION
-- Run after 07_phase3_functions_updates.sql
-- Fixes the two issues in 10_PHASE3_CODE_REVIEW.md
-- ============================================================================

-- ============================================================================
-- FIX 1 — masking views must NOT use security_invoker; the view owner needs
-- direct table access since we revoked SELECT on the base tables from
-- `authenticated`. Masking/isolation logic is unaffected — is_owner() and
-- current_store_id() are independently SECURITY DEFINER and read the real
-- session's auth.uid() regardless of the view's own invoker setting.
-- ============================================================================

drop view if exists product_batches_pos_view;
drop view if exists sale_items_detail_view;

create view product_batches_pos_view as
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

create view sale_items_detail_view as
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

-- IMPORTANT for frontend implementation (not a DB change, a usage note):
-- because SELECT on the base tables is revoked from `authenticated`, do NOT
-- chain `.select()` onto a raw `.from('product_batches').insert(...)` /
-- `.update(...)` call from the client — that implicit re-select will also
-- be denied. After a mutation, re-fetch the row from
-- `product_batches_pos_view` instead.

-- ============================================================================
-- FIX 2 — store creation must not depend on RLS-filtered RETURNING. Replace
-- the three-step client-side insert (stores -> user_roles -> store_settings)
-- with one SECURITY DEFINER function that returns a scalar store_id, which
-- is never subject to table-level RLS the way a RETURNING row is.
-- ============================================================================

create or replace function create_store_and_owner(p_store_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  if exists (select 1 from user_roles where user_id = auth.uid()) then
    raise exception 'This account is already linked to a store.';
  end if;

  insert into stores (name)
  values (coalesce(nullif(trim(p_store_name), ''), 'Rajput Medical Store'))
  returning id into v_store_id;

  insert into user_roles (store_id, user_id, role)
  values (v_store_id, auth.uid(), 'owner');

  insert into store_settings (store_id)
  values (v_store_id);

  return v_store_id;
end;
$$;

-- The old `stores_insert_first_time` / `user_roles_insert_owner` "first row"
-- clauses are no longer load-bearing (this function bypasses RLS via
-- SECURITY DEFINER) but are left in place as harmless defense-in-depth for
-- any future direct-table-insert path — not removed, not required.

-- ============================================================================
-- FIX 3 (consistency, not a bug) — adjust_stock / record_supplier_payment
-- now call the shared helper instead of a literal role list, so a future
-- reactivation of `inventory_manager` only requires updating one function.
-- ============================================================================

create or replace function adjust_stock(
  p_batch_id uuid,
  p_quantity_change integer,
  p_movement_type stock_movement_type,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_product_id uuid;
  v_new_qty integer;
begin
  v_store_id := current_store_id();

  if not is_inventory_manager_or_owner() then
    raise exception 'Not permitted to adjust stock';
  end if;
  if p_movement_type not in ('adjustment', 'damaged', 'expired') then
    raise exception 'adjust_stock only supports adjustment/damaged/expired movement types';
  end if;
  if p_notes is null or length(trim(p_notes)) = 0 then
    raise exception 'A note/reason is required for manual stock adjustments';
  end if;

  select product_id into v_product_id from product_batches
    where id = p_batch_id and store_id = v_store_id
    for update;

  if v_product_id is null then
    raise exception 'Batch % not found in this store', p_batch_id;
  end if;

  update product_batches
    set quantity = quantity + p_quantity_change
    where id = p_batch_id
    returning quantity into v_new_qty;

  if v_new_qty < 0 then
    raise exception 'Adjustment would result in negative stock for batch %', p_batch_id;
  end if;

  insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                quantity_change, quantity_after, reference_table,
                                reference_id, notes, created_by)
  values (v_store_id, v_product_id, p_batch_id, p_movement_type,
          p_quantity_change, v_new_qty, null, null, p_notes, auth.uid());
end;
$$;

create or replace function record_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_method payment_method,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_supplier_id uuid;
  v_payment_id uuid;
  v_total numeric;
  v_already_paid numeric;
begin
  v_store_id := current_store_id();

  if not is_inventory_manager_or_owner() then
    raise exception 'Not permitted to record supplier payments';
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select supplier_id, total into v_supplier_id, v_total
    from purchases where id = p_purchase_id and store_id = v_store_id;

  if v_total is null then
    raise exception 'Purchase % not found', p_purchase_id;
  end if;

  select coalesce(sum(amount), 0) into v_already_paid
    from supplier_payments where purchase_id = p_purchase_id;

  if v_already_paid + p_amount > v_total then
    raise exception 'Payment of % exceeds remaining balance of %', p_amount, (v_total - v_already_paid);
  end if;

  insert into supplier_payments (store_id, purchase_id, supplier_id, amount, payment_method, notes, created_by)
  values (v_store_id, p_purchase_id, v_supplier_id, p_amount, p_payment_method, p_notes, auth.uid())
  returning id into v_payment_id;

  update purchases
    set payment_status = case
      when v_already_paid + p_amount >= v_total then 'paid'
      else 'partial'
    end
    where id = p_purchase_id;

  return v_payment_id;
end;
$$;

-- ============================================================================
-- END OF BUGFIX MIGRATION
-- ============================================================================
