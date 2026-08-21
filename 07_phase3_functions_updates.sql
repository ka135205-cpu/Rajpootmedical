-- ============================================================================
-- RAJPUT MEDICAL STORE — PHASE 3 FUNCTION UPDATES
-- Run after 06_phase3_schema_and_rls_updates.sql
-- ============================================================================

-- ============================================================================
-- process_sale (v2) — adds client_transaction_id idempotency + RMS-YYYY-NNNNNN
-- invoice numbering. Same signature as before with one new trailing optional
-- parameter, so existing callers without an offline queue keep working
-- unchanged (client_transaction_id defaults to null → always treated as new).
-- ============================================================================

create or replace function process_sale(
  p_items sale_cart_item[],
  p_customer_id uuid,
  p_total_discount numeric,
  p_amount_paid numeric,
  p_payment_method payment_method,
  p_client_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role user_role;
  v_sale_id uuid;
  v_invoice_number text;
  v_current_year integer;
  v_seq integer;
  v_item sale_cart_item;
  v_remaining_qty integer;
  v_batch record;
  v_take integer;
  v_subtotal numeric := 0;
  v_gross_profit numeric := 0;
  v_line_total numeric;
  v_line_cost numeric;
  v_grand_total numeric;
  v_change numeric;
begin
  v_store_id := current_store_id();
  v_role := current_user_role();

  if v_store_id is null then
    raise exception 'No store context for current user';
  end if;
  if v_role not in ('owner', 'cashier') then
    raise exception 'Role % is not permitted to create sales', v_role;
  end if;

  -- IDEMPOTENCY: if this client_transaction_id was already synced (e.g. the
  -- offline queue retried after a network timeout whose response never
  -- reached the device), return the existing sale instead of reprocessing.
  if p_client_transaction_id is not null then
    select id into v_sale_id from sales
      where store_id = v_store_id and client_transaction_id = p_client_transaction_id;
    if v_sale_id is not null then
      return v_sale_id;
    end if;
  end if;

  if p_items is null or array_length(p_items, 1) is null then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_amount_paid < 0 then
    raise exception 'amount_paid cannot be negative';
  end if;

  -- Atomically reserve the next invoice number for the current year,
  -- resetting the sequence when the year rolls over. Row is locked via the
  -- UPDATE itself (store_settings has one row per store), so two concurrent
  -- sales — from two different devices — can never get the same number.
  v_current_year := extract(year from now())::int;

  update store_settings
    set invoice_seq_number = case
          when invoice_seq_year = v_current_year then invoice_seq_number + 1
          else 1
        end,
        invoice_seq_year = v_current_year
    where store_id = v_store_id
    returning invoice_seq_number into v_seq;

  if v_seq is null then
    raise exception 'store_settings row missing for store %', v_store_id;
  end if;

  v_invoice_number := 'RMS-' || v_current_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into sales (store_id, invoice_number, customer_id, cashier_id,
                      subtotal, discount_total, total, amount_paid, change_due,
                      payment_method, gross_profit, client_transaction_id,
                      synced_from_offline)
  values (v_store_id, v_invoice_number, p_customer_id, auth.uid(),
          0, coalesce(p_total_discount, 0), 0, p_amount_paid, 0,
          p_payment_method, 0, p_client_transaction_id,
          p_client_transaction_id is not null)
  returning id into v_sale_id;

  foreach v_item in array p_items loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Invalid quantity for product %', v_item.product_id;
    end if;

    v_remaining_qty := v_item.quantity;

    for v_batch in
      select id, quantity, purchase_price, selling_price
      from product_batches
      where product_id = v_item.product_id
        and store_id = v_store_id
        and quantity > 0
        and expiry_date >= current_date
      order by expiry_date asc
      for update
    loop
      exit when v_remaining_qty <= 0;

      v_take := least(v_remaining_qty, v_batch.quantity);
      v_line_total := (v_batch.selling_price * v_take) - coalesce(v_item.unit_discount, 0);
      v_line_cost := v_batch.purchase_price * v_take;

      insert into sale_items (sale_id, product_id, batch_id, quantity,
                               unit_price, unit_cost, discount, line_total, line_profit)
      values (v_sale_id, v_item.product_id, v_batch.id, v_take,
              v_batch.selling_price, v_batch.purchase_price,
              coalesce(v_item.unit_discount, 0), v_line_total,
              v_line_total - v_line_cost);

      update product_batches set quantity = quantity - v_take where id = v_batch.id;

      insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                    quantity_change, quantity_after, reference_table,
                                    reference_id, created_by)
      values (v_store_id, v_item.product_id, v_batch.id, 'sale',
              -v_take, v_batch.quantity - v_take, 'sales', v_sale_id, auth.uid());

      v_subtotal := v_subtotal + v_line_total;
      v_gross_profit := v_gross_profit + (v_line_total - v_line_cost);
      v_remaining_qty := v_remaining_qty - v_take;
    end loop;

    if v_remaining_qty > 0 then
      raise exception 'Insufficient non-expired stock for product % (short by %)',
        v_item.product_id, v_remaining_qty;
    end if;
  end loop;

  v_grand_total := v_subtotal - coalesce(p_total_discount, 0);
  if v_grand_total < 0 then v_grand_total := 0; end if;
  v_change := greatest(p_amount_paid - v_grand_total, 0);

  update sales
    set subtotal = v_subtotal, total = v_grand_total,
        change_due = v_change, gross_profit = v_gross_profit
    where id = v_sale_id;

  if p_amount_paid > 0 then
    insert into payments (store_id, sale_id, customer_id, amount, payment_method, created_by)
    values (v_store_id, v_sale_id, p_customer_id,
            least(p_amount_paid, v_grand_total), p_payment_method, auth.uid());
  end if;

  if p_customer_id is null and p_amount_paid < v_grand_total then
    raise exception 'Credit sales require a customer to be selected';
  end if;

  return v_sale_id;
end;
$$;

-- ============================================================================
-- process_return (v2) — cashier-initiated returns are recorded as 'pending'
-- and do NOT touch stock yet. Owner-initiated returns are auto-approved and
-- restock immediately (same behavior as before for the owner).
-- ============================================================================

create or replace function process_return(
  p_sale_id uuid,
  p_items return_cart_item[],
  p_reason text,
  p_restock boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role user_role;
  v_return_id uuid;
  v_item return_cart_item;
  v_sale_item record;
  v_refund numeric := 0;
  v_line_refund numeric;
  v_returned_count integer;
  v_auto_approve boolean;
begin
  v_store_id := current_store_id();
  v_role := current_user_role();

  if v_role not in ('owner', 'cashier') then
    raise exception 'Role % is not permitted to process returns', v_role;
  end if;
  if not exists (select 1 from sales where id = p_sale_id and store_id = v_store_id) then
    raise exception 'Sale % not found in this store', p_sale_id;
  end if;

  v_auto_approve := is_owner();

  insert into returns (store_id, sale_id, reason, refund_amount, processed_by, status,
                        approved_by, approved_at)
  values (v_store_id, p_sale_id, p_reason, 0, auth.uid(),
          case when v_auto_approve then 'approved' else 'pending' end,
          case when v_auto_approve then auth.uid() else null end,
          case when v_auto_approve then now() else null end)
  returning id into v_return_id;

  foreach v_item in array p_items loop
    select * into v_sale_item from sale_items where id = v_item.sale_item_id and sale_id = p_sale_id;
    if v_sale_item is null then
      raise exception 'sale_item % does not belong to sale %', v_item.sale_item_id, p_sale_id;
    end if;

    select coalesce(sum(ri.quantity), 0) into v_returned_count
      from return_items ri where ri.sale_item_id = v_item.sale_item_id;

    if v_returned_count + v_item.quantity > v_sale_item.quantity then
      raise exception 'Cannot return more than was sold for line %', v_item.sale_item_id;
    end if;

    v_line_refund := (v_sale_item.unit_price * v_item.quantity)
                      - (v_sale_item.discount * v_item.quantity / greatest(v_sale_item.quantity, 1));

    -- restocked flag on the line records INTENT; actual quantity change only
    -- happens now if auto-approved, otherwise happens later in approve_return()
    insert into return_items (return_id, sale_item_id, product_id, batch_id,
                               quantity, unit_price, line_refund, restocked)
    values (v_return_id, v_item.sale_item_id, v_sale_item.product_id, v_sale_item.batch_id,
            v_item.quantity, v_sale_item.unit_price, v_line_refund,
            v_auto_approve and p_restock);

    if v_auto_approve and p_restock then
      update product_batches set quantity = quantity + v_item.quantity
        where id = v_sale_item.batch_id
        returning quantity into v_returned_count;

      insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                    quantity_change, quantity_after, reference_table,
                                    reference_id, created_by)
      values (v_store_id, v_sale_item.product_id, v_sale_item.batch_id, 'return',
              v_item.quantity, v_returned_count, 'returns', v_return_id, auth.uid());
    end if;

    v_refund := v_refund + v_line_refund;
  end loop;

  update returns set refund_amount = v_refund where id = v_return_id;

  if v_auto_approve then
    update sales
      set status = case
        when (select coalesce(sum(ri.quantity), 0) from return_items ri
              join sale_items si on si.id = ri.sale_item_id
              where si.sale_id = p_sale_id and ri.restocked = true)
             >= (select sum(quantity) from sale_items where sale_id = p_sale_id)
        then 'returned'
        else 'partially_returned'
      end
      where id = p_sale_id;
  end if;

  return v_return_id;
end;
$$;

-- ============================================================================
-- approve_return — owner-only. Finalizes a cashier-initiated pending return:
-- restocks batches (if the line was marked for restock), updates sale status.
-- Rejecting a return leaves stock untouched and marks it 'rejected' for the
-- audit trail — nothing is silently deleted.
-- ============================================================================

create or replace function approve_return(
  p_return_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_sale_id uuid;
  v_item record;
  v_new_qty integer;
begin
  v_store_id := current_store_id();

  if not is_owner() then
    raise exception 'Only the owner can approve or reject returns';
  end if;

  select sale_id into v_sale_id from returns
    where id = p_return_id and store_id = v_store_id and status = 'pending';

  if v_sale_id is null then
    raise exception 'Pending return % not found in this store', p_return_id;
  end if;

  if not p_approve then
    update returns set status = 'rejected', approved_by = auth.uid(), approved_at = now()
      where id = p_return_id;
    return;
  end if;

  for v_item in
    select ri.*, si.batch_id as sale_batch_id
    from return_items ri
    join sale_items si on si.id = ri.sale_item_id
    where ri.return_id = p_return_id
  loop
    update product_batches set quantity = quantity + v_item.quantity
      where id = v_item.sale_batch_id
      returning quantity into v_new_qty;

    update return_items set restocked = true where id = v_item.id;

    insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                  quantity_change, quantity_after, reference_table,
                                  reference_id, created_by)
    values (v_store_id, v_item.product_id, v_item.sale_batch_id, 'return',
            v_item.quantity, v_new_qty, 'returns', p_return_id, auth.uid());
  end loop;

  update returns set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_return_id;

  update sales
    set status = case
      when (select coalesce(sum(quantity), 0) from return_items where sale_item_id in
            (select id from sale_items where sale_id = v_sale_id))
           >= (select sum(quantity) from sale_items where sale_id = v_sale_id)
      then 'returned'
      else 'partially_returned'
    end
    where id = v_sale_id;
end;
$$;

-- ============================================================================
-- END OF PHASE 3 FUNCTION UPDATES
-- ============================================================================
