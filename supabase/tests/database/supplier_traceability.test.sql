begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- A. Legacy supplier codes map old SASPoS rows and are unique when present.
select has_column('public', 'suppliers', 'legacy_code', 'suppliers stores a legacy code');
insert into public.suppliers(id, name, legacy_code) values
  ('e1000000-0000-0000-0000-000000000001', 'Supplier Legacy', 'S-001');
select throws_ok(
  $$insert into public.suppliers(id, name, legacy_code) values ('e1000000-0000-0000-0000-000000000002', 'Supplier Lain', 'S-001')$$,
  23505,
  'duplicate key value violates unique constraint "uq_suppliers_legacy_code"',
  'legacy codes are unique when not null'
);
select lives_ok(
  $$insert into public.suppliers(id, name, legacy_code) values ('e1000000-0000-0000-0000-000000000003', 'Supplier Tanpa Kode', null)$$,
  'null legacy codes are allowed more than once'
);

-- C. Invoiced batches expose their supplier; opening stock has no supplier.
insert into public.categories(id, name) values ('e2000000-0000-0000-0000-000000000001', 'Trace category');
insert into public.subcategories(id, name) values ('e2000000-0000-0000-0000-000000000002', 'Trace subcategory');
insert into public.products(id, sku, name, category_id, subcategory_id, base_unit) values
  ('e3000000-0000-0000-0000-000000000001', 'TRACE-1', 'Trace product',
   'e2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'tablet');
insert into public.employees(id, full_name, position) values
  ('e4000000-0000-0000-0000-000000000001', 'Trace owner', 'owner_admin');
insert into public.purchase_invoices(id, supplier_id, invoice_number, invoice_date, total_amount, created_by, updated_by) values
  ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'INV-SUP-001', '2026-11-01', 100,
   'e4000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001');
insert into public.purchase_invoice_items(
  id, invoice_id, product_id, product_name_snapshot, sku_snapshot, base_unit_snapshot,
  unit_name_snapshot, conversion_to_base, cost_price, tax_rate, selling_price, pricing_mode,
  quantity, batch_number, expired_date, created_by, updated_by
) values (
  'e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001', 'Trace product', 'TRACE-1', 'tablet', 'tablet', 1,
  100, 0, 150, 'selling_price', 10, 'INVOICED', '2030-01-01',
  'e4000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001'
);
insert into public.product_batches(id, product_id, batch_number, expired_date, quantity, cost_price, purchase_invoice_item_id) values
  ('e7000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'INVOICED', '2030-01-01', 10, 100,
   'e6000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001', 'OPENING', '2031-01-01', 5, 90, null);

select is(
  (select supplier_id from public.batch_supplier where batch_id = 'e7000000-0000-0000-0000-000000000001'),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'batch_supplier returns the supplier for an invoiced batch'
);
select is(
  (select invoice_number from public.batch_supplier where batch_id = 'e7000000-0000-0000-0000-000000000001'),
  'INV-SUP-001',
  'batch_supplier returns the source invoice'
);
select is(
  (select supplier_id from public.batch_supplier where batch_id = 'e7000000-0000-0000-0000-000000000002'),
  null::uuid,
  'batch_supplier returns NULL for opening-stock batches'
);
select is(
  (select count(*)::integer from public.batch_supplier),
  2,
  'batch_supplier exposes every batch exactly once'
);

select * from finish();
rollback;
