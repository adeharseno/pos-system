# Database Design — Pharmacy POS (Pilot 1)

> Part of the Technical Design. See also `api-contract.md`, `business-logic.md`, `folder-structure.md`.

## 1. General Conventions

- **IDs**: all primary keys use `UUID` (`gen_random_uuid()`), except `auth.users` (managed by Supabase).
- **Timestamps**: `created_at` / `updated_at` are always `timestamptz`, default `now()`, stored in UTC — conversion to local time is done in the frontend.
- **Soft delete**: not used in Pilot 1. Active status is tracked via `is_active` on master data. Transaction data is never deleted.
- **Money**: `numeric(14,2)`. **Quantity**: `integer` (base unit; no fractional tablets).
- **Auth**: role is stored in `raw_app_meta_data.role` on `auth.users` (`owner_admin` | `kasir`), **not** in a custom table — per PRD Section 7.3 (see also `user_profiles` below for the link to employee data).
- **Audit trail**: every significant action (transaction, void, return, adjustment) records `*_by` (user UUID) and a timestamp — no separate `audit_log` table in Pilot 1 (columns on each table are sufficient), keeping the schema lean.
- **Naming**: `snake_case` for all tables and columns.

---

## 2. Entity Relationship Diagram (abbreviated)

```
categories ──┬─< subcategories
             │
suppliers ───┼─────────────┐
storage_locations ─────────┼──< products >──< product_units
                            │        │
                            │        └──< product_batches ──< stock_opname_items
                            │
employees ──< user_profiles (1:1 with auth.users)
employees ──< shifts ──< attendances
employees ──< cash_drawer_sessions

transactions ──< transaction_items >── product_batches (FEFO source)
transactions ──< transaction_prescriptions
transactions ──< returns ──< return_items >── product_batches (return destination batch)

stock_opname_sessions ──< stock_opname_items

operational_expenses (standalone, for P&L report)
app_settings (singleton, for QRIS image & config)
```

---

## 3. Database Schema (DDL — PostgreSQL / Supabase)

> Run as a Supabase migration (`supabase/migrations/0001_init.sql`). Order is arranged so all FK references are valid.

```sql
-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- 1. ENUMS
-- ============================================================
create type drug_classification as enum ('otc', 'otc_limited', 'prescription_required');
create type payment_method as enum ('cash', 'qris');
create type transaction_status as enum ('completed', 'voided');
create type return_source as enum ('customer', 'supplier');
create type employee_position as enum ('owner_admin', 'kasir', 'staf'); -- 'staf' = non-login, employee record only (e.g. courier/cleaning), no system access

-- ============================================================
-- 2. MASTER DATA: CATEGORIES, SUPPLIERS, LOCATIONS
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
  unique (category_id, name)
);
create index idx_subcategories_category on subcategories(category_id);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  address text,
  license_number text, -- pharmaceutical distributor license number
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null,
  rack_code text not null,
  level_code text not null,
  full_code text not null unique, -- generated in app layer: ZONE-RACK-LEVEL
  created_at timestamptz not null default now(),
  unique (zone_code, rack_code, level_code)
);

-- ============================================================
-- 3. PRODUCTS (PRODUCTS, UNITS, BATCHES)
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  generic_name text,
  description text,
  manufacturer text,
  image_url text,
  category_id uuid not null references categories(id) on delete restrict,
  subcategory_id uuid not null references subcategories(id) on delete restrict,
  drug_classification drug_classification not null default 'otc',
  -- requires_prescription is a generated column so checkout queries can read a single boolean without a CASE expression
  requires_prescription boolean generated always as (drug_classification = 'prescription_required') stored,
  base_unit text not null, -- e.g. "tablet"
  cost_price numeric(14,2) not null default 0, -- reference cost price (initial reference; actual COGS comes from product_batches.cost_price)
  tax_rate numeric(5,2) not null default 0, -- percentage, e.g. 11.00
  is_taxable boolean not null default false,
  storage_location_id uuid references storage_locations(id) on delete set null,
  minimum_stock integer not null default 0,
  default_supplier_id uuid references suppliers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on products(category_id);
create index idx_products_subcategory on products(subcategory_id);
create index idx_products_supplier on products(default_supplier_id);
create index idx_products_active on products(is_active);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops); -- requires pg_trgm for name search

create extension if not exists pg_trgm;

create table product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_name text not null, -- "Box", "Strip", "Tablet"
  conversion_to_base integer not null check (conversion_to_base > 0), -- 1 of this unit = N base units
  selling_price numeric(14,2) not null check (selling_price >= 0),
  barcode text unique,
  is_base_unit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, unit_name)
);
create index idx_product_units_product on product_units(product_id);
create index idx_product_units_barcode on product_units(barcode);

-- Enforce exactly one is_base_unit=true per product (enforced in app layer on create/update,
-- backed by a partial unique index as an additional DB-level guard):
create unique index uq_one_base_unit_per_product on product_units(product_id) where is_base_unit = true;

create table product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  batch_number text not null,
  expired_date date not null,
  quantity integer not null check (quantity >= 0), -- remaining stock in base_unit
  cost_price numeric(14,2) not null check (cost_price >= 0),
  received_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch_number, expired_date) -- prevents duplicate entries per 5.7.1
);
-- Primary index for FEFO queries: per product, non-expired batches, sorted by expired_date ASC
create index idx_batches_fefo on product_batches(product_id, expired_date) where quantity > 0;
create index idx_batches_expiring on product_batches(expired_date) where quantity > 0;

-- ============================================================
-- 4. EMPLOYEES, SHIFTS, ATTENDANCE, CASH DRAWER
-- ============================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position employee_position not null default 'kasir',
  phone text,
  join_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bridge between auth.users (Supabase Auth) <-> employees, so roles stay in Auth metadata
-- while actions can still be traced back to employee profiles.
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid unique references employees(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now()
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
  opening_balance numeric(14,2) not null,
  opened_at timestamptz not null default now(),
  closing_balance_expected numeric(14,2), -- computed by system: opening + total cash sales at close
  closing_balance_actual numeric(14,2),   -- entered by cashier
  variance numeric(14,2),                 -- actual - expected
  closed_at timestamptz,
  notes text,
  is_open boolean generated always as (closed_at is null) stored
);
create index idx_cash_drawer_employee on cash_drawer_sessions(employee_id);
-- Prevent a cashier from having two open sessions simultaneously:
create unique index uq_one_open_session_per_employee on cash_drawer_sessions(employee_id) where closed_at is null;

-- ============================================================
-- 5. TRANSACTIONS (CASHIER)
-- ============================================================
create table transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique, -- format: INV-YYYYMMDD-XXXX, generated in app layer
  cashier_id uuid not null references employees(id) on delete restrict,
  cash_drawer_session_id uuid references cash_drawer_sessions(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  payment_method payment_method not null,
  cash_received numeric(14,2),      -- for cash payments
  cash_change numeric(14,2),        -- for cash payments
  payment_confirmed_at timestamptz, -- for QRIS: when cashier pressed "Payment Received"
  payment_confirmed_by uuid references employees(id),
  status transaction_status not null default 'completed',
  voided_at timestamptz,
  voided_by uuid references employees(id),
  void_reason text,
  created_at timestamptz not null default now()
);
create index idx_transactions_cashier on transactions(cashier_id);
create index idx_transactions_created on transactions(created_at);
create index idx_transactions_status on transactions(status);
create index idx_transactions_payment_method on transactions(payment_method);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_unit_id uuid not null references product_units(id) on delete restrict,
  batch_id uuid not null references product_batches(id) on delete restrict, -- FEFO: 1 row per source batch
  quantity_in_unit integer not null check (quantity_in_unit > 0), -- quantity in the sell unit chosen by cashier (for this batch's portion)
  quantity_in_base integer not null check (quantity_in_base > 0), -- converted to base_unit, deducted from batch
  unit_price numeric(14,2) not null,           -- product_units selling_price at time of transaction (snapshot)
  cost_price_snapshot numeric(14,2) not null,  -- batch cost_price at time of transaction (for accurate COGS, see PRD 6.3)
  tax_rate_snapshot numeric(5,2) not null default 0,
  subtotal numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index idx_txn_items_transaction on transaction_items(transaction_id);
create index idx_txn_items_product on transaction_items(product_id);
create index idx_txn_items_batch on transaction_items(batch_id);

create table transaction_prescriptions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  prescription_number text,
  doctor_name text not null,
  patient_name text not null,
  photo_url text, -- Supabase Storage, optional
  created_at timestamptz not null default now()
);
create index idx_prescriptions_transaction on transaction_prescriptions(transaction_id);

-- ============================================================
-- 6. RETURNS
-- ============================================================
create table returns (
  id uuid primary key default gen_random_uuid(),
  source return_source not null, -- 'customer' | 'supplier'
  transaction_id uuid references transactions(id) on delete restrict, -- required if source='customer', null if 'supplier'
  reason text not null,
  processed_by uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_returns_transaction on returns(transaction_id);

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid not null references product_batches(id) on delete restrict, -- batch where stock is returned to
  transaction_item_id uuid references transaction_items(id) on delete set null, -- original row reference, for customer returns
  quantity_in_base integer not null check (quantity_in_base > 0),
  created_at timestamptz not null default now()
);
create index idx_return_items_return on return_items(return_id);
create index idx_return_items_batch on return_items(batch_id);

-- ============================================================
-- 7. STOCK OPNAME
-- ============================================================
create table stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  storage_location_id uuid references storage_locations(id) on delete set null, -- optional filter when creating session
  status text not null default 'in_progress' check (status in ('in_progress', 'applied')),
  created_by uuid not null references employees(id) on delete restrict,
  applied_at timestamptz,
  applied_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create table stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references stock_opname_sessions(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid references product_batches(id) on delete set null, -- null if not identified per-batch
  system_quantity integer not null,   -- system stock snapshot when opname session was created
  physical_quantity integer not null, -- physical count result
  variance integer generated always as (physical_quantity - system_quantity) stored,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_opname_items_session on stock_opname_items(session_id);

-- ============================================================
-- 8. FINANCE & SETTINGS
-- ============================================================
create table operational_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null, -- "Salary", "Rent", "Electricity", etc. (free text, no separate master table in Pilot 1)
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  created_by uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_expenses_date on operational_expenses(expense_date);

-- Singleton table for app configuration (QRIS image, expiry alert threshold, etc.)
create table app_settings (
  id boolean primary key default true check (id = true), -- "singleton row" pattern
  qris_image_url text,
  expiry_alert_days integer not null default 30,
  updated_at timestamptz not null default now(),
  updated_by uuid references employees(id)
);
insert into app_settings (id) values (true);
```

### 3.1 Schema Design Notes

- **`requires_prescription` & `variance` as generated columns**: eliminates the risk of FEFO/opname logic computing wrong values due to a forgotten sync of derived columns.
- **`transaction_items` one row per source batch**: if checking out one item requires two batches (first batch has insufficient stock), the system automatically writes two `transaction_items` rows with different `batch_id` but the same `product_unit_id`. This is also what makes per-batch returns (5.9) and the stock card (5.7.2) accurate.
- **`cost_price_snapshot` in `transaction_items`**: the key to accurate P&L reporting (6.3) — COGS is computed from the cost price of the batch actually sold, not from an average.
- **No `roles`/`permissions` table**: per 7.3, roles are stored in Supabase Auth `app_metadata`.
- **No `outlet_id`, `available_online/offline`, `purchase_orders`/`goods_receipts`, `payments` (gateway), or approval workflow tables** — intentionally absent per PRD Section 1.4.

---

## 4. Row Level Security (RLS)

Supabase enables RLS by default. Since all database access goes through **Next.js API Routes using the `service_role` key** (not directly from the browser with the `anon` key — see Section 7 for security rationale), RLS serves as **defense-in-depth**, not the sole access control layer. Pattern used:

```sql
-- Enable RLS on all tables
alter table products enable row level security;
-- ... (repeat for all tables)

-- Default: deny all direct client access (anon/authenticated key)
-- because all production access goes through service_role in API Routes (which bypasses RLS automatically).
create policy "deny_all_client_access" on products
  for all
  to authenticated, anon
  using (false);
```

This policy is repeated for every transactional/operational table. The goal: **prevent the browser from accessing Supabase directly**, ensuring the only path is through the Next.js API Route where business rules (FEFO, prescription validation, etc.) are enforced.

> Supabase Storage buckets (`prescriptions`, `product-images`, `qris`) still use role-based policies from the JWT `app_metadata.role`, because prescription photo uploads go directly from the client for efficiency (see Section 6.4).

---

## 5. Role & Auth Model

```jsonc
// auth.users.app_metadata (set by Owner/Admin when creating an employee account, via Supabase Admin API)
{
  "role": "owner_admin" | "kasir",
  "employee_id": "uuid-employee"
}
```

- Login is done via `supabase.auth.signInWithPassword()` from the client.
- Next.js middleware (`middleware.ts`) reads the session and checks `role` to restrict route access (`/admin/**` for `owner_admin` only, `/kasir/**` for both).
- Each API Route re-verifies the role from the JWT (don't rely on middleware alone) before executing business logic.

---
