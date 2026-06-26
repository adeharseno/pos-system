-- Migration: 0002_rls_policies.sql
-- POS Apotek (Pilot 1)
--
-- Pola: seluruh akses database production dilakukan dari Next.js API Routes
-- menggunakan service_role key (otomatis bypass RLS). RLS di sini berfungsi
-- sebagai defense-in-depth untuk MENCEGAH client (browser) mengakses tabel
-- transaksional/operasional secara langsung lewat anon/authenticated key.
--
-- TODO: tabel ini sudah dicakup di bawah. Tambahkan tabel baru ke daftar
-- jika ada penambahan skema di migration berikutnya.

alter table categories enable row level security;
alter table subcategories enable row level security;
alter table suppliers enable row level security;
alter table storage_locations enable row level security;
alter table products enable row level security;
alter table product_units enable row level security;
alter table product_batches enable row level security;
alter table employees enable row level security;
alter table user_profiles enable row level security;
alter table shifts enable row level security;
alter table attendances enable row level security;
alter table cash_drawer_sessions enable row level security;
alter table transactions enable row level security;
alter table transaction_items enable row level security;
alter table transaction_prescriptions enable row level security;
alter table returns enable row level security;
alter table return_items enable row level security;
alter table stock_opname_sessions enable row level security;
alter table stock_opname_items enable row level security;
alter table operational_expenses enable row level security;
alter table app_settings enable row level security;

-- Default: tolak semua akses langsung dari client (anon/authenticated key).
-- service_role (dipakai API Route) otomatis bypass RLS, jadi tidak terdampak policy ini.

create policy "deny_all_client_access" on categories for all to authenticated, anon using (false);
create policy "deny_all_client_access" on subcategories for all to authenticated, anon using (false);
create policy "deny_all_client_access" on suppliers for all to authenticated, anon using (false);
create policy "deny_all_client_access" on storage_locations for all to authenticated, anon using (false);
create policy "deny_all_client_access" on products for all to authenticated, anon using (false);
create policy "deny_all_client_access" on product_units for all to authenticated, anon using (false);
create policy "deny_all_client_access" on product_batches for all to authenticated, anon using (false);
create policy "deny_all_client_access" on employees for all to authenticated, anon using (false);
create policy "deny_all_client_access" on user_profiles for all to authenticated, anon using (false);
create policy "deny_all_client_access" on shifts for all to authenticated, anon using (false);
create policy "deny_all_client_access" on attendances for all to authenticated, anon using (false);
create policy "deny_all_client_access" on cash_drawer_sessions for all to authenticated, anon using (false);
create policy "deny_all_client_access" on transactions for all to authenticated, anon using (false);
create policy "deny_all_client_access" on transaction_items for all to authenticated, anon using (false);
create policy "deny_all_client_access" on transaction_prescriptions for all to authenticated, anon using (false);
create policy "deny_all_client_access" on returns for all to authenticated, anon using (false);
create policy "deny_all_client_access" on return_items for all to authenticated, anon using (false);
create policy "deny_all_client_access" on stock_opname_sessions for all to authenticated, anon using (false);
create policy "deny_all_client_access" on stock_opname_items for all to authenticated, anon using (false);
create policy "deny_all_client_access" on operational_expenses for all to authenticated, anon using (false);
create policy "deny_all_client_access" on app_settings for all to authenticated, anon using (false);

-- Catatan: Supabase Storage bucket (prescriptions, product-images, qris) TIDAK
-- dicakup migration ini. Bucket tersebut menggunakan policy berbasis role dari
-- JWT app_metadata.role karena upload foto dilakukan langsung dari client.
-- Lihat docs/folder-structure.md & docs/api-contract.md § 6.4 untuk detail.
