-- Migration: 0001_init.sql
-- POS Apotek (Pilot 1)
-- Diekstrak dari docs/database-design.md Bagian 3

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
create type employee_position as enum ('owner_admin', 'kasir', 'staf'); -- 'staf' = non-login, hanya data karyawan (mis. kurir/cleaning), tidak punya akses sistem

-- ============================================================
-- 2. MASTER DATA: KATEGORI, SUPPLIER, LOKASI
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
  license_number text, -- nomor izin PBF
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null,
  rack_code text not null,
  level_code text not null,
  full_code text not null unique, -- generated di app layer: ZONE-RACK-LEVEL
  created_at timestamptz not null default now(),
  unique (zone_code, rack_code, level_code)
);

-- ============================================================
-- 3. PRODUK (PRODUCTS, UNITS, BATCHES)
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
  -- requires_prescription = kolom turunan, di-generate agar query checkout cukup baca 1 kolom boolean tanpa CASE
  requires_prescription boolean generated always as (drug_classification = 'prescription_required') stored,
  base_unit text not null, -- contoh: "tablet"
  cost_price numeric(14,2) not null default 0, -- harga modal acuan (referensi awal; harga modal RIIL diambil dari product_batches.cost_price saat HPP dihitung)
  tax_rate numeric(5,2) not null default 0, -- persen, contoh 11.00
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
create index idx_products_name_trgm on products using gin (name gin_trgm_ops); -- butuh extension pg_trgm utk search nama

create extension if not exists pg_trgm;

create table product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_name text not null, -- "Kotak", "Strip", "Tablet"
  conversion_to_base integer not null check (conversion_to_base > 0), -- 1 unit ini = N base_unit
  selling_price numeric(14,2) not null check (selling_price >= 0),
  barcode text unique,
  is_base_unit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, unit_name)
);
create index idx_product_units_product on product_units(product_id);
create index idx_product_units_barcode on product_units(barcode);

-- Pastikan tepat satu is_base_unit=true per produk (enforced di app layer saat create/update,
-- didukung partial unique index sbg pengaman tambahan di DB):
create unique index uq_one_base_unit_per_product on product_units(product_id) where is_base_unit = true;

create table product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  batch_number text not null,
  expired_date date not null,
  quantity integer not null check (quantity >= 0), -- sisa stok, dalam base_unit
  cost_price numeric(14,2) not null check (cost_price >= 0),
  received_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch_number, expired_date) -- mencegah duplikasi entri sesuai 5.7.1
);
-- Index utama untuk query FEFO: per produk, batch belum expired, urut expired_date ASC
create index idx_batches_fefo on product_batches(product_id, expired_date) where quantity > 0;
create index idx_batches_expiring on product_batches(expired_date) where quantity > 0;

-- ============================================================
-- 4. KARYAWAN, SHIFT, ABSENSI, KAS
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

-- Jembatan antara auth.users (Supabase Auth) <-> employees, supaya role tetap di Auth metadata
-- tapi aksi tetap bisa ditelusuri ke profil karyawan.
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
  closing_balance_expected numeric(14,2), -- dihitung sistem: opening + total cash sales saat ditutup
  closing_balance_actual numeric(14,2),   -- dihitung kasir
  variance numeric(14,2),                 -- actual - expected
  closed_at timestamptz,
  notes text,
  is_open boolean generated always as (closed_at is null) stored
);
create index idx_cash_drawer_employee on cash_drawer_sessions(employee_id);
-- Pastikan satu kasir tidak punya 2 sesi terbuka bersamaan:
create unique index uq_one_open_session_per_employee on cash_drawer_sessions(employee_id) where closed_at is null;

-- ============================================================
-- 5. TRANSAKSI (KASIR)
-- ============================================================
create table transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique, -- format: INV-YYYYMMDD-XXXX, generated di app layer/sequence
  cashier_id uuid not null references employees(id) on delete restrict,
  cash_drawer_session_id uuid references cash_drawer_sessions(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  payment_method payment_method not null,
  cash_received numeric(14,2),      -- jika cash
  cash_change numeric(14,2),        -- jika cash
  payment_confirmed_at timestamptz, -- jika qris: waktu kasir menekan "Konfirmasi Pembayaran Diterima"
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
  batch_id uuid not null references product_batches(id) on delete restrict, -- FEFO: 1 baris per batch sumber
  quantity_in_unit integer not null check (quantity_in_unit > 0), -- jumlah dalam satuan jual yg dipilih kasir (utk porsi dari batch ini)
  quantity_in_base integer not null check (quantity_in_base > 0), -- konversi ke base_unit, dikurangi dari batch
  unit_price numeric(14,2) not null,      -- selling_price product_units saat transaksi (snapshot)
  cost_price_snapshot numeric(14,2) not null, -- cost_price batch saat transaksi (untuk HPP akurat, lihat 6.3 PRD)
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
  photo_url text, -- Supabase Storage, opsional
  created_at timestamptz not null default now()
);
create index idx_prescriptions_transaction on transaction_prescriptions(transaction_id);

-- ============================================================
-- 6. RETUR
-- ============================================================
create table returns (
  id uuid primary key default gen_random_uuid(),
  source return_source not null, -- 'customer' | 'supplier'
  transaction_id uuid references transactions(id) on delete restrict, -- wajib diisi jika source='customer', null jika 'supplier'
  reason text not null,
  processed_by uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_returns_transaction on returns(transaction_id);

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  batch_id uuid not null references product_batches(id) on delete restrict, -- batch tujuan stok dikembalikan
  transaction_item_id uuid references transaction_items(id) on delete set null, -- ref baris asal, jika retur pelanggan
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
  storage_location_id uuid references storage_locations(id) on delete set null, -- filter opsional saat sesi dibuat
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
  batch_id uuid references product_batches(id) on delete set null, -- null jika tidak teridentifikasi per-batch
  system_quantity integer not null,   -- snapshot stok sistem saat opname dibuat
  physical_quantity integer not null, -- hasil hitung fisik staf
  variance integer generated always as (physical_quantity - system_quantity) stored,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_opname_items_session on stock_opname_items(session_id);

-- ============================================================
-- 8. KEUANGAN & SETTINGS
-- ============================================================
create table operational_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null, -- "Gaji", "Sewa", "Listrik", dst (free text, tanpa master data terpisah di Pilot 1)
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  created_by uuid not null references employees(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_expenses_date on operational_expenses(expense_date);

-- Singleton table untuk konfigurasi aplikasi (gambar QRIS, threshold alert kedaluwarsa, dst)
create table app_settings (
  id boolean primary key default true check (id = true), -- pola "singleton row"
  qris_image_url text,
  expiry_alert_days integer not null default 30,
  updated_at timestamptz not null default now(),
  updated_by uuid references employees(id)
);
insert into app_settings (id) values (true);
