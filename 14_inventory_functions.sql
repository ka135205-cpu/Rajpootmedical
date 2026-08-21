-- ============================================================================
-- RAJPUT MEDICAL STORE — MIGRATION 14 (Phase 5: Inventory)
-- Run after 13_audit_and_rpc_fixes.sql
--
-- Only one new function needed for Inventory: adding a batch outside the
-- full Purchases flow (Phase 6) still must never modify stock without a
-- stock_movements ledger entry, per the architecture's "never silently
-- modify stock" rule. Product CRUD itself needs no new function — the
-- existing products_write RLS policy (owner-only) already covers plain
-- insert/update/delete via the client, and SELECT was never revoked on
-- `products` (only on product_batches/sale_items, for cost-masking).
-- ============================================================================

create or replace function add_product_batch(
  p_product_id uuid,
  p_batch_number text,
  p_quantity integer,
  p_purchase_price numeric,
  p_selling_price numeric,
  p_expiry_date date,
  p_supplier_id uuid,
  p_received_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_batch_id uuid;
begin
  v_store_id := current_store_id();

  if not is_owner() then
    raise exception 'Only the owner can add stock batches';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  if p_expiry_date is null or p_expiry_date <= current_date then
    raise exception 'Expiry date must be in the future';
  end if;
  if p_purchase_price is null or p_purchase_price < 0 then
    raise exception 'Purchase price must be zero or positive';
  end if;
  if p_selling_price is null or p_selling_price < 0 then
    raise exception 'Selling price must be zero or positive';
  end if;
  if not exists (select 1 from products where id = p_product_id and store_id = v_store_id) then
    raise exception 'Product % not found in this store', p_product_id;
  end if;

  insert into product_batches (store_id, product_id, supplier_id, batch_number,
                                quantity, purchase_price, selling_price, expiry_date,
                                received_date)
  values (v_store_id, p_product_id, p_supplier_id, p_batch_number,
          p_quantity, p_purchase_price, p_selling_price, p_expiry_date,
          coalesce(p_received_date, current_date))
  returning id into v_batch_id;

  insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                quantity_change, quantity_after, reference_table,
                                reference_id, created_by)
  values (v_store_id, p_product_id, v_batch_id,
          case when p_supplier_id is null then 'initial' else 'purchase' end,
          p_quantity, p_quantity, null, null, auth.uid());

  return v_batch_id;
end;
$$;

-- ============================================================================
-- END OF MIGRATION 14
-- ============================================================================
