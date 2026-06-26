-- Migration: 0002_rls_policies.sql
-- Pharmacy POS (Pilot 1)
--
-- Pattern: all production database access is done from Next.js API Routes
-- using the service_role key (which bypasses RLS automatically). RLS here
-- acts as defense-in-depth to PREVENT the client (browser) from accessing
-- transactional/operational tables directly via the anon/authenticated key.
--
-- TODO: all tables are covered below. Add new tables to this list
-- if schema is extended in future migrations.

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

-- Default: deny all direct client access (anon/authenticated key).
-- service_role (used by API Routes) bypasses RLS automatically and is unaffected by these policies.

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

-- Note: Supabase Storage buckets (prescriptions, product-images, qris) are NOT
-- covered by this migration. Those buckets use role-based policies derived from
-- JWT app_metadata.role because prescription photo uploads go directly from the
-- client. See docs/folder-structure.md & docs/api-contract.md § 6.4 for details.
