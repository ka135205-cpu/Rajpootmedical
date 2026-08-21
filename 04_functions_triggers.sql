-- ============================================================================
-- RAJPUT MEDICAL STORE — FUNCTIONS & TRIGGERS (Phase 2)
-- Run after 02_schema.sql and 03_rls_policies.sql
--
-- These functions are the ONLY sanctioned way to mutate stock. All are
-- SECURITY DEFINER + re-check store/role internally, and use row locking
-- (SELECT ... FOR UPDATE) so concurrent sales on two devices can never both
-- oversell the same batch. Called from the client via supabase.rpc(...).
-- ============================================================================

-- ============================================================================
-- GENERIC AUDIT TRIGGER
-- ============================================================================

create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_record_id uuid;
begin
  v_record_id := coalesce(new.id, old.id);
  v_store_id := coalesce(new.store_id, old.store_id);

  insert into audit_logs (store_id, user_id, table_name, record_id, action, old_data, new_data)
  values (
    v_store_id,
    auth.uid(),
    tg_table_name,
    v_record_id,
    lower(tg_op)::audit_action,
    case when tg_op in ('update','delete') then to_jsonb(old) else null end,
    case when tg_op in ('update','insert') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_products
  after insert or update or delete on products
  for each row execute function log_audit_event();

create trigger trg_audit_batches
  after insert or update or delete on product_batches
  for each row execute function log_audit_event();

create trigger trg_audit_sales
  after insert or update or delete on sales
  for each row execute function log_audit_event();

create trigger trg_audit_purchases
  after insert or update or delete on purchases
  for each row execute function log_audit_event();

create trigger trg_audit_customers
  after insert or update or delete on customers
  for each row execute function log_audit_event();

create trigger trg_audit_suppliers
  after insert or update or delete on suppliers
  for each row execute function log_audit_event();

create trigger trg_audit_expenses
  after insert or update or delete on expenses
  for each row execute function log_audit_event();

create trigger trg_audit_user_roles
  after insert or update or delete on user_roles
  for each row execute function log_audit_event();

create trigger trg_audit_store_settings
  after insert or update or delete on store_settings
  for each row execute function log_audit_event();

-- ============================================================================
-- process_sale
--   Input: cart items (product_id, quantity, unit_discount), customer_id,
--          total_discount, amount_paid, payment_method
--   Does FEFO batch selection, locks rows, decrements stock, writes sale +
--   sale_items + stock_movements + (optionally) first payment row, all
--   atomically. Raises an exception (rolls back everything) on insufficient
--   stock or any invalid input — the client shows this as a POS error.
-- ============================================================================

create type sale_cart_item as (
  product_id uuid,
  quantity integer,
  unit_discount numeric
);

create or replace function process_sale(
  p_items sale_cart_item[],
  p_customer_id uuid,
  p_total_discount numeric,
  p_amount_paid numeric,
  p_payment_method payment_method
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
  v_invoice_number integer;
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
  if p_items is null or array_length(p_items, 1) is null then
    raise exception 'Sale must contain at least one item';
  end if;
  if p_amount_paid < 0 then
    raise exception 'amount_paid cannot be negative';
  end if;

  -- Reserve the next invoice number atomically for this store
  update store_settings
    set next_invoice_number = next_invoice_number + 1
    where store_id = v_store_id
    returning next_invoice_number - 1 into v_invoice_number;

  if v_invoice_number is null then
    raise exception 'store_settings row missing for store %', v_store_id;
  end if;

  -- Create the sale header first (totals filled in after item loop, then updated)
  insert into sales (store_id, invoice_number, customer_id, cashier_id,
                      subtotal, discount_total, total, amount_paid, change_due,
                      payment_method, gross_profit)
  values (v_store_id, v_invoice_number, p_customer_id, auth.uid(),
          0, coalesce(p_total_discount, 0), 0, p_amount_paid, 0,
          p_payment_method, 0)
  returning id into v_sale_id;

  foreach v_item in array p_items loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Invalid quantity for product %', v_item.product_id;
    end if;

    v_remaining_qty := v_item.quantity;

    -- FEFO: earliest-expiring, non-expired, in-stock batches first; lock rows
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

      update product_batches
        set quantity = quantity - v_take
        where id = v_batch.id;

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
    set subtotal = v_subtotal,
        total = v_grand_total,
        change_due = v_change,
        gross_profit = v_gross_profit
    where id = v_sale_id;

  -- Record the amount actually tendered as the first payment row
  if p_amount_paid > 0 then
    insert into payments (store_id, sale_id, customer_id, amount, payment_method, created_by)
    values (v_store_id, v_sale_id,
            p_customer_id,
            least(p_amount_paid, v_grand_total),
            p_payment_method, auth.uid());
  end if;

  if p_customer_id is null and p_amount_paid < v_grand_total then
    raise exception 'Credit sales require a customer to be selected';
  end if;

  return v_sale_id;
end;
$$;

-- ============================================================================
-- process_purchase
--   Creates a purchase header, purchase_items, a NEW batch per line (or adds
--   quantity to an existing batch if batch_number+expiry match exactly for
--   the same product), and stock_movements. Atomic.
-- ============================================================================

create type purchase_cart_item as (
  product_id uuid,
  batch_number text,
  quantity integer,
  purchase_price numeric,
  selling_price numeric,
  expiry_date date
);

create or replace function process_purchase(
  p_supplier_id uuid,
  p_items purchase_cart_item[],
  p_invoice_reference text,
  p_payment_status purchase_payment_status,
  p_amount_paid numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_role user_role;
  v_purchase_id uuid;
  v_item purchase_cart_item;
  v_existing_batch_id uuid;
  v_batch_id uuid;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_new_qty integer;
begin
  v_store_id := current_store_id();
  v_role := current_user_role();

  if v_role not in ('owner', 'inventory_manager') then
    raise exception 'Role % is not permitted to record purchases', v_role;
  end if;
  if p_items is null or array_length(p_items, 1) is null then
    raise exception 'Purchase must contain at least one item';
  end if;

  insert into purchases (store_id, supplier_id, invoice_reference, subtotal, total,
                          payment_status, created_by)
  values (v_store_id, p_supplier_id, p_invoice_reference, 0, 0,
          p_payment_status, auth.uid())
  returning id into v_purchase_id;

  foreach v_item in array p_items loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Invalid quantity for product %', v_item.product_id;
    end if;
    if v_item.expiry_date is null or v_item.expiry_date <= current_date then
      raise exception 'Expiry date must be in the future for product %', v_item.product_id;
    end if;

    v_line_total := v_item.purchase_price * v_item.quantity;

    -- Merge into an existing batch only on an exact match (product, batch_number,
    -- expiry, purchase_price) — otherwise always create a new batch row, per
    -- real pharmacy batch-tracking practice.
    select id into v_existing_batch_id
    from product_batches
    where product_id = v_item.product_id
      and store_id = v_store_id
      and coalesce(batch_number, '') = coalesce(v_item.batch_number, '')
      and expiry_date = v_item.expiry_date
      and purchase_price = v_item.purchase_price
    for update;

    if v_existing_batch_id is not null then
      update product_batches
        set quantity = quantity + v_item.quantity,
            selling_price = v_item.selling_price
        where id = v_existing_batch_id
        returning quantity into v_new_qty;
      v_batch_id := v_existing_batch_id;
    else
      insert into product_batches (store_id, product_id, supplier_id, batch_number,
                                    quantity, purchase_price, selling_price, expiry_date)
      values (v_store_id, v_item.product_id, p_supplier_id, v_item.batch_number,
              v_item.quantity, v_item.purchase_price, v_item.selling_price,
              v_item.expiry_date)
      returning id, quantity into v_batch_id, v_new_qty;
    end if;

    insert into purchase_items (purchase_id, product_id, batch_id, quantity,
                                 purchase_price, selling_price, expiry_date, line_total)
    values (v_purchase_id, v_item.product_id, v_batch_id, v_item.quantity,
            v_item.purchase_price, v_item.selling_price, v_item.expiry_date, v_line_total);

    insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                  quantity_change, quantity_after, reference_table,
                                  reference_id, created_by)
    values (v_store_id, v_item.product_id, v_batch_id, 'purchase',
            v_item.quantity, v_new_qty, 'purchases', v_purchase_id, auth.uid());

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  update purchases set subtotal = v_subtotal, total = v_subtotal where id = v_purchase_id;

  if p_amount_paid > 0 then
    insert into supplier_payments (store_id, purchase_id, supplier_id, amount,
                                    payment_method, created_by)
    values (v_store_id, v_purchase_id, p_supplier_id, p_amount_paid, 'cash', auth.uid());
  end if;

  return v_purchase_id;
end;
$$;

-- ============================================================================
-- process_return
--   Returns specific quantities of specific sale_items. Restocks (adds back
--   to the ORIGINAL batch — batch identity is preserved, not re-FEFO'd),
--   records stock_movements, and updates the sale's status. Does not delete
--   or mutate the original sale row's totals — refund_amount is tracked
--   separately on the `returns` header, per spec §12.
-- ============================================================================

create type return_cart_item as (
  sale_item_id uuid,
  quantity integer
);

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
  v_sold_count integer;
  v_returned_count integer;
begin
  v_store_id := current_store_id();
  v_role := current_user_role();

  if v_role not in ('owner', 'cashier') then
    raise exception 'Role % is not permitted to process returns', v_role;
  end if;

  if not exists (select 1 from sales where id = p_sale_id and store_id = v_store_id) then
    raise exception 'Sale % not found in this store', p_sale_id;
  end if;

  insert into returns (store_id, sale_id, reason, refund_amount, processed_by)
  values (v_store_id, p_sale_id, p_reason, 0, auth.uid())
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

    insert into return_items (return_id, sale_item_id, product_id, batch_id,
                               quantity, unit_price, line_refund, restocked)
    values (v_return_id, v_item.sale_item_id, v_sale_item.product_id, v_sale_item.batch_id,
            v_item.quantity, v_sale_item.unit_price, v_line_refund, p_restock);

    if p_restock then
      update product_batches
        set quantity = quantity + v_item.quantity
        where id = v_sale_item.batch_id
        returning quantity into v_sold_count;

      insert into stock_movements (store_id, product_id, batch_id, movement_type,
                                    quantity_change, quantity_after, reference_table,
                                    reference_id, created_by)
      values (v_store_id, v_sale_item.product_id, v_sale_item.batch_id, 'return',
              v_item.quantity, v_sold_count, 'returns', v_return_id, auth.uid());
    end if;

    v_refund := v_refund + v_line_refund;
  end loop;

  update returns set refund_amount = v_refund where id = v_return_id;

  update sales
    set status = case
      when (select coalesce(sum(ri.quantity), 0) from return_items ri
            join sale_items si on si.id = ri.sale_item_id
            where si.sale_id = p_sale_id)
           >= (select sum(quantity) from sale_items where sale_id = p_sale_id)
      then 'returned'
      else 'partially_returned'
    end
    where id = p_sale_id;

  return v_return_id;
end;
$$;

-- ============================================================================
-- adjust_stock — manual correction (damaged/expired/manual adjustment), always
-- logged to stock_movements with a mandatory reason/note.
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
  v_role user_role;
  v_product_id uuid;
  v_new_qty integer;
begin
  v_store_id := current_store_id();
  v_role := current_user_role();

  if v_role not in ('owner', 'inventory_manager') then
    raise exception 'Role % is not permitted to adjust stock', v_role;
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

-- ============================================================================
-- record_customer_payment — additional partial payment against a sale
-- ============================================================================

create or replace function record_customer_payment(
  p_sale_id uuid,
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
  v_customer_id uuid;
  v_payment_id uuid;
  v_total numeric;
  v_already_paid numeric;
begin
  v_store_id := current_store_id();

  if current_user_role() not in ('owner', 'cashier') then
    raise exception 'Not permitted to record payments';
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select customer_id, total into v_customer_id, v_total
    from sales where id = p_sale_id and store_id = v_store_id;

  if v_total is null then
    raise exception 'Sale % not found', p_sale_id;
  end if;

  select coalesce(sum(amount), 0) into v_already_paid from payments where sale_id = p_sale_id;

  if v_already_paid + p_amount > v_total then
    raise exception 'Payment of % exceeds remaining balance of %', p_amount, (v_total - v_already_paid);
  end if;

  insert into payments (store_id, sale_id, customer_id, amount, payment_method, notes, created_by)
  values (v_store_id, p_sale_id, v_customer_id, p_amount, p_payment_method, p_notes, auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ============================================================================
-- record_supplier_payment — mirror of the above, for accounts payable
-- ============================================================================

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

  if current_user_role() not in ('owner', 'inventory_manager') then
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
-- END OF FUNCTIONS/TRIGGERS FILE
-- ============================================================================
