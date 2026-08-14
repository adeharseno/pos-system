-- Migration: 0001_init.sql
-- Pharmacy POS (Pilot 1)
-- Schema hardened before first deployment; no production migration history exists yet.

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================
-- 1. ENUMS
-- ============================================================
create type drug_classification as enum ('otc', 'otc_limited', 'prescription_required');
create type payment_method as enum ('cash', 'qris');
create type transaction_status as enum ('pending_payment', 'completed', 'voided');
create type return_source as enum ('customer', 'supplier');
create type employee_position as enum ('owner_admin', 'kasir', 'staf');

-- ============================================================
-- 2. SHARED TRIGGER
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 3. MASTER DATA
-- ============================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name),
  unique (id, category_id)
);
create index idx_subcategories_category on subcategories(category_id);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  address text,
  license_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null,
  rack_code text not null,
  level_code text not null,
  full_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_code, rack_code, level_code)
);

-- ============================================================
-- 4. PRODUCTS / UNITS / BATCHES
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  generic_name text,
  description text,
  manufacturer text,
  image_url text,
  category_id uuid not null,
  subcategory_id uuid not null,
  drug_classification drug_classification not null default 'otc',
  requires_prescription boolean generated always as (drug_classification = 'prescription_required') stored,
  base_unit text not null,
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  is_taxable boolean not null default false,
  storage_location_id uuid references storage_locations(id) on delete set null,
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  default_supplier_id uuid references suppliers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_products_subcategory_category
    foreign key (subcategory_id, category_id)
    references subcategories(id, category_id)
    on delete restrict
);
create index idx_products_category on products(category_id);
create index idx_products_subcategory on products(subcategory_id);
create index idx_products_supplier on products(default_supplier_id);
create index idx_products_active on products(is_active);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);

create table product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_name text not null,
  conversion_to_base integer not null check (conversion_to_base > 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  barcode text unique,
  is_base_unit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, unit_name),
  unique (id, product_id)
);
create index idx_product_units_product on product_units(product_id);
create index idx_product_units_barcode on product_units(barcode);
create unique index uq_one_base_unit_per_product on product_units(product_id) where is_base_unit = true;

create table product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  batch_number text not null,
  expired_date date not null,
  quantity integer not null check (quantity >= 0),
  cost_price numeric(14,2) not null check (cost_price >= 0),
  received_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch_number, expired_date),
  unique (id, product_id)
);
create index idx_batches_fefo on product_batches(product_id, expired_date, created_at) where quantity > 0;
create index idx_batches_expiring on product_batches(expired_date) where quantity > 0;

-- ============================================================
-- 5. EMPLOYEES / SHIFTS / ATTENDANCE / CASH DRAWER
-- ============================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position employee_position not null default 'kasir',
  phone text,
  join_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid unique references employees(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  shift_date date not null,
  planned_start time not null,
  planned_end time not null,
  created_at timestamptz not null default now()
);
create index idx_shifts_employee_date on shifts(employee_id, shift_date);

create table attendances (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  check_in_at timestamptz,
  check_out_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_attendances_shift on attendances(shift_id);

create table cash_drawer_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  shift_id uuid references shifts(id) on delete set null,
  opening_balance numeric(14,2) not null check (opening_balance >= 0),
  opened_at timestamptz not null default now(),
  closing_balance_expected numeric(14,2),
  closing_balance_actual numeric(14,2),
  variance numeric(14,2),
  closed_at timestamptz,
  notes text,
  is_open boolean generated always as (closed_at is null) stored
);
create index idx_cash_drawer_employee on cash_drawer_sessions(employee_id);
create unique index uq_one_open_session_per_employee on cash_drawer_sessions(employee_id) where closed_at is null;

-- ============================================================
-- 6. INVOICE SEQUENCE / TRANSACTIONS
-- ============================================================
create table invoice_sequences (
  business_date date primary key,
  last_number integer not null default 0 check (last_number >= 0)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  business_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  cashier_id uuid not null references employees(id) on delete restrict,
  cash_drawer_session_id uuid not null references cash_drawer_sessions(id) on delete restrict,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  payment_method payment_method not null,
  cash_received numeric(14,2) check (cash_received is null or cash_received >= 0),
  cash_change numeric(14,2) check (cash_change is null or cash_change >= 0),
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid references employees(id) on delete restrict,
  status transaction_status not null,
  voided_at timestamptz,
  voided_by uuid references employees(id) on delete restrict,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_payment_confirmation_pair check (
    (payment_confirmed_at is null and payment_confirmed_by is null)
    or (payment_confirmed_at is not null and payment_confirmed_by is not null)
  ),
  constraint chk_transaction_payment_shape check (
    (
      payment_method = 'cash'
      and status in ('completed', 'voided')
      and cash_received is not null
      and cash_received >= total_amount
      and cash_change is not null
      and cash_change = cash_received - total_amount
      and payment_confirmed_at is not null
      and payment_confirmed_by is not null
    )
    or
    (
      payment_method = 'qris'
      and cash_received is null
      and cash_change is null
      and (
        (status = 'pending_payment' and payment_confirmed_at is null and payment_confirmed_by is null)
        or (status = 'completed' and payment_confirmed_at is not null and payment_confirmed_by is not null)
        or status = 'voided'
      )
    )
  ),
  constraint chk_transaction_void_shape check (
    (
      status = 'voided'
      and voided_at is not null
      and voided_by is not null
      and void_reason is not null
      and btrim(void_reason) <> ''
    )
    or
    (
      status <> 'voided'
      and voided_at is null
      and voided_by is null
      and void_reason is null
    )
  )
);
create index idx_transactions_cashier on transactions(cashier_id);
create index idx_transactions_created on transactions(created_at);
create index idx_transactions_business_date on transactions(business_date);
create index idx_transactions_status on transactions(status);
create index idx_transactions_payment_method on transactions(payment_method);
create index idx_transactions_drawer on transactions(cash_drawer_session_id);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  product_unit_id uuid not null,
  quantity_in_unit integer not null check (quantity_in_unit > 0),
  conversion_to_base_snapshot integer not null check (conversion_to_base_snapshot > 0),
  quantity_in_base integer not null check (quantity_in_base > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  tax_rate_snapshot numeric(5,2) not null default 0 check (tax_rate_snapshot >= 0 and tax_rate_snapshot <= 100),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  unique (id, product_id),
  constraint fk_transaction_items_unit_product
    foreign key (product_unit_id, product_id)
    references product_units(id, product_id)
    on delete restrict
);
create index idx_txn_items_transaction on transaction_items(transaction_id);
create index idx_txn_items_product on transaction_items(product_id);

create table transaction_item_batches (
  id uuid primary key default gen_random_uuid(),
  transaction_item_id uuid not null,
  product_id uuid not null,
  batch_id uuid not null,
  quantity_in_base integer not null check (quantity_in_base > 0),
  cost_price_snapshot numeric(14,2) not null check (cost_price_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (transaction_item_id, batch_id),
  constraint fk_transaction_item_batches_item_product
    foreign key (transaction_item_id, product_id)
    references transaction_items(id, product_id)
    on delete restrict,
  constraint fk_transaction_item_batches_batch_product
    foreign key (batch_id, product_id)
    references product_batches(id, product_id)
    on delete restrict
);
create index idx_txn_item_batches_item on transaction_item_batches(transaction_item_id);
create index idx_txn_item_batches_batch on transaction_item_batches(batch_id);

create table transaction_prescriptions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete restrict,
  prescription_number text,
  doctor_name text not null,
  patient_name text not null,
  photo_url text,
  created_at timestamptz not null default now()
);
create index idx_prescriptions_transaction on transaction_prescriptions(transaction_id);

-- ============================================================
-- 7. RETURNS
-- ============================================================
create table returns (
  id uuid primary key default gen_random_uuid(),
  source return_source not null,
  transaction_id uuid references transactions(id) on delete restrict,
  refund_method payment_method,
  cash_drawer_session_id uuid references cash_drawer_sessions(id) on delete restrict,
  business_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  reason text not null,
  processed_by uuid not null references employees(id) on delete restrict,
  refund_subtotal numeric(14,2) not null default 0 check (refund_subtotal >= 0),
  refund_tax_amount numeric(14,2) not null default 0 check (refund_tax_amount >= 0),
  refund_total numeric(14,2) not null default 0 check (refund_total >= 0),
  created_at timestamptz not null default now(),
  constraint chk_return_source_refund_shape check (
    (
      source = 'customer'
      and transaction_id is not null
      and refund_method is not null
      and (
        (refund_method = 'cash' and cash_drawer_session_id is not null)
        or (refund_method = 'qris' and cash_drawer_session_id is null)
      )
    )
    or
    (
      source = 'supplier'
      and transaction_id is null
      and refund_method is null
      and cash_drawer_session_id is null
    )
  )
);
create index idx_returns_transaction on returns(transaction_id);
create index idx_returns_business_date on returns(business_date);
create index idx_returns_source on returns(source);
create index idx_returns_drawer on returns(cash_drawer_session_id);

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  transaction_item_id uuid,
  quantity_in_base integer not null check (quantity_in_base > 0),
  refund_subtotal numeric(14,2) not null default 0 check (refund_subtotal >= 0),
  refund_tax_amount numeric(14,2) not null default 0 check (refund_tax_amount >= 0),
  refund_total numeric(14,2) not null default 0 check (refund_total >= 0),
  created_at timestamptz not null default now(),
  unique (id, product_id),
  constraint fk_return_items_transaction_item_product
    foreign key (transaction_item_id, product_id)
    references transaction_items(id, product_id)
    on delete restrict
);
create index idx_return_items_return on return_items(return_id);
create index idx_return_items_transaction_item on return_items(transaction_item_id);
create index idx_return_items_product on return_items(product_id);

create table return_item_batches (
  id uuid primary key default gen_random_uuid(),
  return_item_id uuid not null,
  product_id uuid not null,
  batch_id uuid not null,
  quantity_in_base integer not null check (quantity_in_base > 0),
  cost_price_snapshot numeric(14,2) not null check (cost_price_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (return_item_id, batch_id),
  constraint fk_return_item_batches_item_product
    foreign key (return_item_id, product_id)
    references return_items(id, product_id)
    on delete restrict,
  constraint fk_return_item_batches_batch_product
    foreign key (batch_id, product_id)
    references product_batches(id, product_id)
    on delete restrict
);
create index idx_return_item_batches_item on return_item_batches(return_item_id);
create index idx_return_item_batches_batch on return_item_batches(batch_id);

-- ============================================================
-- 8. STOCK OPNAME
-- ============================================================
create table stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  storage_location_id uuid references storage_locations(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'applied', 'cancelled')),
  created_by uuid not null references employees(id) on delete restrict,
  applied_at timestamptz,
  applied_by uuid references employees(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_stock_opname_lifecycle check (
    (
      status = 'in_progress'
      and applied_at is null and applied_by is null
      and cancelled_at is null and cancelled_by is null
    )
    or
    (
      status = 'applied'
      and applied_at is not null and applied_by is not null
      and cancelled_at is null and cancelled_by is null
    )
    or
    (
      status = 'cancelled'
      and cancelled_at is not null and cancelled_by is not null
      and applied_at is null and applied_by is null
    )
  )
);
create unique index uq_one_in_progress_stock_opname
  on stock_opname_sessions(status)
  where status = 'in_progress';

create table stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references stock_opname_sessions(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid not null,
  system_quantity integer not null check (system_quantity >= 0),
  physical_quantity integer check (physical_quantity is null or physical_quantity >= 0),
  variance integer generated always as (physical_quantity - system_quantity) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, batch_id),
  constraint fk_stock_opname_items_batch_product
    foreign key (batch_id, product_id)
    references product_batches(id, product_id)
    on delete restrict
);
create index idx_opname_items_session on stock_opname_items(session_id);
create index idx_opname_items_batch on stock_opname_items(batch_id);

-- ============================================================
-- 9. FINANCE & SETTINGS
-- ============================================================
create table operational_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  created_by uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_expenses_date on operational_expenses(expense_date);

create table app_settings (
  id boolean primary key default true check (id = true),
  qris_image_url text,
  expiry_alert_days integer not null default 30 check (expiry_alert_days >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references employees(id) on delete restrict
);
insert into app_settings (id) values (true);

-- ============================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================
create trigger trg_categories_updated_at before update on categories for each row execute function set_updated_at();
create trigger trg_subcategories_updated_at before update on subcategories for each row execute function set_updated_at();
create trigger trg_suppliers_updated_at before update on suppliers for each row execute function set_updated_at();
create trigger trg_storage_locations_updated_at before update on storage_locations for each row execute function set_updated_at();
create trigger trg_products_updated_at before update on products for each row execute function set_updated_at();
create trigger trg_product_units_updated_at before update on product_units for each row execute function set_updated_at();
create trigger trg_product_batches_updated_at before update on product_batches for each row execute function set_updated_at();
create trigger trg_employees_updated_at before update on employees for each row execute function set_updated_at();
create trigger trg_user_profiles_updated_at before update on user_profiles for each row execute function set_updated_at();
create trigger trg_transactions_updated_at before update on transactions for each row execute function set_updated_at();
create trigger trg_stock_opname_sessions_updated_at before update on stock_opname_sessions for each row execute function set_updated_at();
create trigger trg_stock_opname_items_updated_at before update on stock_opname_items for each row execute function set_updated_at();
create trigger trg_app_settings_updated_at before update on app_settings for each row execute function set_updated_at();
