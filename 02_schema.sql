-- ============================================================================
-- RAJPUT MEDICAL STORE — DATABASE SCHEMA (Phase 2)
-- Target: Supabase (PostgreSQL 15+)
-- Run as a migration: supabase/migrations/0001_initial_schema.sql
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fast fuzzy product search

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('owner', 'inventory_manager', 'cashier');

create type payment_method as enum ('cash', 'card', 'bank_transfer', 'other');

create type purchase_payment_status as enum ('paid', 'partial', 'unpaid');

create type stock_movement_type as enum (
  'purchase', 'sale', 'return', 'adjustment', 'damaged', 'expired', 'initial'
);

create type audit_action as enum ('insert', 'update', 'delete');

-- ============================================================================
-- 1. STORES
-- ============================================================================

create table stores (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Rajput Medical Store',
  address       text,
  phone         text,
  email         text,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- 2. PROFILES (1:1 with auth.users)
-- ============================================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- 3. USER_ROLES (role assignment per store; supports multi-store later)
-- ============================================================================

create table user_roles (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  role          user_role not null,
  created_at    timestamptz not null default now(),
  unique (store_id, user_id)
);

create index idx_user_roles_user on user_roles(user_id);
create index idx_user_roles_store on user_roles(store_id);

-- ============================================================================
-- 4. STORE_SETTINGS (one row per store)
-- ============================================================================

create table store_settings (
  store_id              uuid primary key references stores(id) on delete cascade,
  invoice_footer        text default 'Thank you for visiting Rajput Medical Store',
  currency              text not null default 'PKR',
  currency_symbol       text not null default 'Rs.',
  tax_enabled            boolean not null default false,
  tax_percent            numeric(5,2) not null default 0,
  default_discount_pct  numeric(5,2) not null default 0,
  low_stock_default      integer not null default 20,
  expiry_alert_days      integer not null default 90,
  receipt_width_mm       integer not null default 80 check (receipt_width_mm in (58, 80)),
  next_invoice_number    integer not null default 1,
  updated_at             timestamptz not null default now()
);

-- ============================================================================
-- 5. CATEGORIES
-- ============================================================================

create table categories (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now(),
  unique (store_id, name)
);

-- ============================================================================
-- 6. SUPPLIERS
-- ============================================================================

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  name          text not null,
  company       text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_suppliers_store on suppliers(store_id);
create index idx_suppliers_name_trgm on suppliers using gin (name gin_trgm_ops);

-- ============================================================================
-- 7. CUSTOMERS
-- ============================================================================

create table customers (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  name          text not null,
  phone         text,
  address       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_customers_store on customers(store_id);
create index idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create index idx_customers_phone on customers(phone);

-- ============================================================================
-- 8. PRODUCTS (catalog — no price/quantity here, see product_batches)
-- ============================================================================

create table products (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  name              text not null,
  generic_name      text,
  brand             text,
  category_id       uuid references categories(id) on delete set null,
  medicine_type     text,                       -- tablet/syrup/injection/etc, free text
  barcode           text,
  min_stock_level   integer not null default 20 check (min_stock_level >= 0),
  rack_location     text,
  description       text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_id, barcode)
);

create index idx_products_store on products(store_id);
create index idx_products_category on products(category_id);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
create index idx_products_generic_trgm on products using gin (generic_name gin_trgm_ops);
create index idx_products_barcode on products(barcode);
create index idx_products_active on products(store_id, is_active);

-- ============================================================================
-- 9. PRODUCT_BATCHES (actual stock: qty, price, expiry per batch — FEFO unit)
-- ============================================================================

create table product_batches (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  product_id        uuid not null references products(id) on delete cascade,
  supplier_id       uuid references suppliers(id) on delete set null,
  batch_number      text,
  quantity          integer not null default 0 check (quantity >= 0),
  purchase_price    numeric(12,2) not null check (purchase_price >= 0),
  selling_price     numeric(12,2) not null check (selling_price >= 0),
  expiry_date       date not null,
  received_date     date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_batches_product on product_batches(product_id);
create index idx_batches_store on product_batches(store_id);
-- FEFO selection: earliest expiry first, only rows with stock
create index idx_batches_fefo on product_batches(product_id, expiry_date)
  where quantity > 0;
create index idx_batches_expiry on product_batches(store_id, expiry_date);

-- ============================================================================
-- 10. PURCHASES (header) + PURCHASE_ITEMS (lines)
-- ============================================================================

create table purchases (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  supplier_id       uuid not null references suppliers(id) on delete restrict,
  invoice_reference text,
  purchase_date     date not null default current_date,
  subtotal          numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  payment_status    purchase_payment_status not null default 'unpaid',
  created_by        uuid not null references profiles(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_purchases_store on purchases(store_id);
create index idx_purchases_supplier on purchases(supplier_id);
create index idx_purchases_date on purchases(store_id, purchase_date desc);

create table purchase_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_id       uuid not null references purchases(id) on delete cascade,
  product_id        uuid not null references products(id) on delete restrict,
  batch_id          uuid references product_batches(id) on delete set null,
  quantity          integer not null check (quantity > 0),
  purchase_price    numeric(12,2) not null check (purchase_price >= 0),
  selling_price     numeric(12,2) not null check (selling_price >= 0),
  expiry_date       date not null,
  line_total        numeric(12,2) not null,
  created_at        timestamptz not null default now()
);

create index idx_purchase_items_purchase on purchase_items(purchase_id);
create index idx_purchase_items_product on purchase_items(product_id);

-- ============================================================================
-- 11. SUPPLIER_PAYMENTS (money paid out against a purchase)
-- ============================================================================

create table supplier_payments (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  purchase_id       uuid not null references purchases(id) on delete cascade,
  supplier_id       uuid not null references suppliers(id) on delete restrict,
  amount            numeric(12,2) not null check (amount > 0),
  payment_method    payment_method not null default 'cash',
  payment_date      date not null default current_date,
  notes             text,
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_supplier_payments_purchase on supplier_payments(purchase_id);
create index idx_supplier_payments_supplier on supplier_payments(supplier_id);

-- ============================================================================
-- 12. SALES (header) + SALE_ITEMS (lines, batch-level cost snapshot)
-- ============================================================================

create table sales (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  invoice_number    integer not null,
  customer_id       uuid references customers(id) on delete set null,
  cashier_id        uuid not null references profiles(id),
  subtotal          numeric(12,2) not null default 0,
  discount_total    numeric(12,2) not null default 0,
  tax_total         numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  amount_paid       numeric(12,2) not null default 0,
  change_due        numeric(12,2) not null default 0,
  payment_method    payment_method not null default 'cash',
  gross_profit      numeric(12,2) not null default 0,
  status            text not null default 'completed'
                     check (status in ('completed', 'returned', 'partially_returned')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_id, invoice_number)
);

create index idx_sales_store_date on sales(store_id, created_at desc);
create index idx_sales_customer on sales(customer_id);
create index idx_sales_cashier on sales(cashier_id);

create table sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references sales(id) on delete cascade,
  product_id        uuid not null references products(id) on delete restrict,
  batch_id          uuid not null references product_batches(id) on delete restrict,
  quantity          integer not null check (quantity > 0),
  unit_price        numeric(12,2) not null check (unit_price >= 0),  -- price AT sale time
  unit_cost         numeric(12,2) not null check (unit_cost >= 0),   -- cost AT sale time
  discount           numeric(12,2) not null default 0,
  line_total        numeric(12,2) not null,
  line_profit       numeric(12,2) not null,
  created_at        timestamptz not null default now()
);

create index idx_sale_items_sale on sale_items(sale_id);
create index idx_sale_items_product on sale_items(product_id);
create index idx_sale_items_batch on sale_items(batch_id);

-- ============================================================================
-- 13. PAYMENTS (customer payments against a sale — supports partial/udhaar)
-- ============================================================================

create table payments (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  sale_id           uuid not null references sales(id) on delete cascade,
  customer_id       uuid references customers(id) on delete set null,
  amount            numeric(12,2) not null check (amount > 0),
  payment_method    payment_method not null default 'cash',
  payment_date      date not null default current_date,
  notes             text,
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_payments_sale on payments(sale_id);
create index idx_payments_customer on payments(customer_id);
create index idx_payments_store_date on payments(store_id, payment_date desc);

-- ============================================================================
-- 14. RETURNS (header) + RETURN_ITEMS (lines)
-- ============================================================================

create table returns (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  sale_id           uuid not null references sales(id) on delete restrict,
  reason            text,
  refund_amount     numeric(12,2) not null default 0,
  processed_by      uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_returns_sale on returns(sale_id);
create index idx_returns_store_date on returns(store_id, created_at desc);

create table return_items (
  id                uuid primary key default gen_random_uuid(),
  return_id         uuid not null references returns(id) on delete cascade,
  sale_item_id      uuid not null references sale_items(id) on delete restrict,
  product_id        uuid not null references products(id) on delete restrict,
  batch_id          uuid not null references product_batches(id) on delete restrict,
  quantity          integer not null check (quantity > 0),
  unit_price        numeric(12,2) not null,
  line_refund       numeric(12,2) not null,
  restocked         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index idx_return_items_return on return_items(return_id);

-- ============================================================================
-- 15. EXPENSES
-- ============================================================================

create table expenses (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  category          text not null,   -- rent/electricity/salaries/transport/... (free text + suggested list in UI)
  title             text not null,
  amount            numeric(12,2) not null check (amount > 0),
  expense_date      date not null default current_date,
  description       text,
  payment_method    payment_method not null default 'cash',
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_expenses_store_date on expenses(store_id, expense_date desc);
create index idx_expenses_category on expenses(store_id, category);

-- ============================================================================
-- 16. STOCK_MOVEMENTS (append-only ledger — every quantity change, ever)
-- ============================================================================

create table stock_movements (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id) on delete cascade,
  product_id        uuid not null references products(id) on delete cascade,
  batch_id          uuid not null references product_batches(id) on delete cascade,
  movement_type     stock_movement_type not null,
  quantity_change   integer not null,               -- positive = in, negative = out
  quantity_after    integer not null,                -- snapshot for easy history reading
  reference_table   text,                             -- 'purchases' | 'sales' | 'returns' | null
  reference_id      uuid,
  notes             text,
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_stock_movements_product on stock_movements(product_id, created_at desc);
create index idx_stock_movements_batch on stock_movements(batch_id);
create index idx_stock_movements_store_date on stock_movements(store_id, created_at desc);
create index idx_stock_movements_reference on stock_movements(reference_table, reference_id);

-- ============================================================================
-- 17. AUDIT_LOGS
-- ============================================================================

create table audit_logs (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid,
  user_id           uuid references profiles(id) on delete set null,
  table_name        text not null,
  record_id         uuid,
  action            audit_action not null,
  old_data          jsonb,
  new_data          jsonb,
  created_at        timestamptz not null default now()
);

create index idx_audit_logs_store_date on audit_logs(store_id, created_at desc);
create index idx_audit_logs_table_record on audit_logs(table_name, record_id);
create index idx_audit_logs_user on audit_logs(user_id);

-- ============================================================================
-- CONVENIENCE VIEWS (read-only, computed — never cached/stale business numbers)
-- ============================================================================

-- Current stock per product, derived live from batches
create view product_stock_summary as
select
  p.id as product_id,
  p.store_id,
  p.name,
  p.min_stock_level,
  coalesce(sum(b.quantity) filter (where b.expiry_date >= current_date), 0) as current_stock,
  coalesce(sum(b.quantity) filter (where b.expiry_date < current_date), 0) as expired_stock,
  coalesce(sum(b.quantity * b.purchase_price) filter (where b.expiry_date >= current_date), 0) as inventory_value,
  min(b.expiry_date) filter (where b.quantity > 0 and b.expiry_date >= current_date) as next_expiry_date
from products p
left join product_batches b on b.product_id = p.id
group by p.id, p.store_id, p.name, p.min_stock_level;

-- Daily sales summary (used by dashboard + sales report, single source)
create view daily_sales_summary as
select
  s.store_id,
  date(s.created_at) as sale_date,
  count(*) as transaction_count,
  sum(s.total) as revenue,
  sum(s.gross_profit) as gross_profit,
  sum((select coalesce(sum(si.quantity), 0) from sale_items si where si.sale_id = s.id)) as items_sold
from sales s
where s.status <> 'returned'
group by s.store_id, date(s.created_at);

-- Outstanding customer credit, derived (never stored)
create view customer_outstanding as
select
  c.id as customer_id,
  c.store_id,
  c.name,
  coalesce(sum(s.total), 0) as total_invoiced,
  coalesce((select sum(pay.amount) from payments pay where pay.customer_id = c.id), 0) as total_paid,
  coalesce(sum(s.total), 0)
    - coalesce((select sum(pay.amount) from payments pay where pay.customer_id = c.id), 0)
    as outstanding_balance
from customers c
left join sales s on s.customer_id = c.id and s.status <> 'returned'
group by c.id, c.store_id, c.name;

-- Outstanding supplier payable, derived
create view supplier_outstanding as
select
  sup.id as supplier_id,
  sup.store_id,
  sup.name,
  coalesce(sum(p.total), 0) as total_purchased,
  coalesce((select sum(sp.amount) from supplier_payments sp where sp.supplier_id = sup.id), 0) as total_paid,
  coalesce(sum(p.total), 0)
    - coalesce((select sum(sp.amount) from supplier_payments sp where sp.supplier_id = sup.id), 0)
    as outstanding_balance
from suppliers sup
left join purchases p on p.supplier_id = sup.id
group by sup.id, sup.store_id, sup.name;

-- ============================================================================
-- updated_at auto-touch trigger (generic, reused across tables)
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_stores_updated_at before update on stores
  for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();
create trigger trg_batches_updated_at before update on product_batches
  for each row execute function set_updated_at();
create trigger trg_purchases_updated_at before update on purchases
  for each row execute function set_updated_at();
create trigger trg_sales_updated_at before update on sales
  for each row execute function set_updated_at();

-- ============================================================================
-- handle_new_user: auto-create profile row on Supabase Auth signup
-- ============================================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- END OF SCHEMA FILE
-- Next: 03_rls_policies.sql, 04_functions_triggers.sql
-- ============================================================================
