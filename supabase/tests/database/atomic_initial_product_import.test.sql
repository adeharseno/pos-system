begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(32);

-- This file requires an empty product database. Run it against a disposable
-- local clone, matching the isolated database test procedure.
insert into employees(id,full_name,position) values
('f2100000-0000-4000-8000-000000000001','Import Owner','owner_admin'),
('f2100000-0000-4000-8000-000000000002','Import Cashier','kasir');
insert into categories(id,name) values
('f2200000-0000-4000-8000-000000000001','Import Obat Bebas'),
('f2200000-0000-4000-8000-000000000002','Import Obat Resep');
insert into subcategories(id,name) values
('f2300000-0000-4000-8000-000000000001','Import Tablet'),
('f2300000-0000-4000-8000-000000000002','Import Syrup');
insert into suppliers(id,name) values
('f2400000-0000-4000-8000-000000000001','Import Supplier');

-- Invalid row: the whole request must roll back, including the valid first row.
select throws_ok($$
  select import_initial_products(
    'f2500000-0000-4000-8000-000000000001','f2100000-0000-4000-8000-000000000001',
    '[
      {"sku":"INVALID-VALID","name":"Produk valid","base_unit":"TAB","selling_price":1000,"cost_price":0,"stock":1,"category_id":"f2200000-0000-4000-8000-000000000001","subcategory_id":"f2300000-0000-4000-8000-000000000001","supplier_id":null,"drug_classification":"otc"},
      {"sku":"","name":"Tanpa SKU","base_unit":"TAB","selling_price":1000,"cost_price":0,"stock":1,"category_id":"f2200000-0000-4000-8000-000000000001","subcategory_id":"f2300000-0000-4000-8000-000000000001","supplier_id":null,"drug_classification":"otc"}
    ]'::jsonb
  )
$$,'P0001','INVALID_INITIAL_IMPORT_ROW','a single invalid row rejects the entire import');
select is((select count(*) from products),0::bigint,'invalid import leaves no product behind');
select is((select count(*) from initial_product_import_requests where request_id='f2500000-0000-4000-8000-000000000001'),0::bigint,'invalid import leaves no request record');

create temporary table import_payload as select
  'f2500000-0000-4000-8000-000000000002'::uuid request_id,
  jsonb_build_array(
    jsonb_build_object('sku','0001','name','Produk A','base_unit','TAB','selling_price',16500,'cost_price',0,'stock',10,
      'category_name','Import Obat Bebas','subcategory_name','Import Tablet',
      'supplier_text','Import Supplier','drug_classification','otc'),
    jsonb_build_object('sku','0002','name','Produk B','base_unit','BTL','selling_price',7000,'cost_price',2500,'stock',5,
      'category_name','Import Obat Resep','subcategory_name','Import Syrup',
      'supplier_text',null,'drug_classification','prescription_required')
  ) rows;

create temporary table first_import as
select import_initial_products(request_id,'f2100000-0000-4000-8000-000000000001',rows) data from import_payload;

select is((select data->>'product_count' from first_import),'2','import reports both products');
select is((select data->>'stock_total' from first_import),'15','import reports the total initial stock');
select is((select data->>'replayed' from first_import),'false','first import is not a replay');
select is((select count(*) from products where sku in ('0001','0002')),2::bigint,'both products are committed');
select ok((select exists(select 1 from products where sku='0001')),'leading-zero SKU is preserved exactly');
select is((select pu.selling_price from product_units pu join products p on p.id=pu.product_id where p.sku='0001' and pu.is_base_unit),16500::numeric,'selling price is stored on the base unit');
select is((select pu.unit_name from product_units pu join products p on p.id=pu.product_id where p.sku='0001' and pu.is_base_unit),'TAB','base unit is taken from the file');
select is((select p.category_id from products p where p.sku='0001'),'f2200000-0000-4000-8000-000000000001'::uuid,'category is mapped from the file');
select is((select p.subcategory_id from products p where p.sku='0002'),'f2300000-0000-4000-8000-000000000002'::uuid,'subcategory is mapped from the file');
select is((select p.default_supplier_id from products p where p.sku='0001'),'f2400000-0000-4000-8000-000000000001'::uuid,'supplier is mapped when present');
select is((select p.drug_classification::text from products p where p.sku='0002'),'prescription_required','drug classification is preserved');
select ok((select batch_number is null and expired_date is null from product_batches b join products p on p.id=b.product_id where p.sku='0001'),'initial stock has no physical batch number or expiry');
select is((select b.quantity from product_batches b join products p on p.id=b.product_id where p.sku='0001'),10,'initial stock quantity is exact');
select is((select b.cost_price from product_batches b join products p on p.id=b.product_id where p.sku='0001'),0::numeric,'missing Harga Modal is stored as numeric 0');
select is((select b.quantity from product_batches b join products p on p.id=b.product_id where p.sku='0002'),5,'second product initial stock is exact');
select is((select count(*) from manual_stock_receiving_events where source='initial'),2::bigint,'stock ledger receives one initial event per product');
select ok((select e.source='initial' and e.quantity_base=10 and e.batch_id=b.id and e.reason='Stok awal'
  from manual_stock_receiving_events e join product_batches b on b.id=e.batch_id join products p on p.id=b.product_id
  where p.sku='0001'),'initial event references the anonymous batch');
select is((select count(*) from initial_product_import_requests where request_id=(select request_id from import_payload)),1::bigint,'successful import stores one idempotency record');

select is((select import_initial_products(request_id,'f2100000-0000-4000-8000-000000000001',rows)->>'replayed' from import_payload),'true','retrying the same request replays the result');
select is((select count(*) from products where sku in ('0001','0002')),2::bigint,'replay does not duplicate products');
select is((select count(*) from manual_stock_receiving_events where source='initial'),2::bigint,'replay does not duplicate stock events');
select is((select count(*) from product_batches),2::bigint,'replay does not duplicate batches');

select throws_ok(format(
  'select import_initial_products(%L::uuid,%L::uuid,%L::jsonb)',
  (select request_id from import_payload),
  'f2100000-0000-4000-8000-000000000001',
  (select rows from import_payload) || '[{"sku":"0003","name":"Berbeda","base_unit":"TAB","selling_price":1,"cost_price":0,"stock":1,"category_id":"f2200000-0000-4000-8000-000000000001","subcategory_id":"f2300000-0000-4000-8000-000000000001","supplier_id":null,"drug_classification":"otc"}]'::jsonb
),'P0001','INITIAL_IMPORT_REQUEST_CONFLICT','same request with different data conflicts');

select throws_ok($$
  select import_initial_products(
    'f2500000-0000-4000-8000-000000000003','f2100000-0000-4000-8000-000000000001',
    '[{"sku":"0003","name":"Produk C","base_unit":"TAB","selling_price":1000,"cost_price":0,"stock":1,"category_id":"f2200000-0000-4000-8000-000000000001","subcategory_id":"f2300000-0000-4000-8000-000000000001","supplier_id":null,"drug_classification":"otc"}]'::jsonb
  )
$$,'P0001','INITIAL_IMPORT_REQUIRES_EMPTY_PRODUCTS','a non-empty product database is rejected server-side');
select is((select count(*) from products),2::bigint,'rejected import does not add products');

select throws_ok($$
  select import_initial_products(
    'f2500000-0000-4000-8000-000000000004','f2100000-0000-4000-8000-000000000002',
    '[{"sku":"0004","name":"Produk D","base_unit":"TAB","selling_price":1000,"cost_price":0,"stock":1,"category_id":"f2200000-0000-4000-8000-000000000001","subcategory_id":"f2300000-0000-4000-8000-000000000001","supplier_id":null,"drug_classification":"otc"}]'::jsonb
  )
$$,'P0001','INVALID_EMPLOYEE','only an active owner admin can import');
select is((select count(*) from products),2::bigint,'authorization failure does not add products');

select ok(not has_function_privilege('authenticated','import_initial_products(uuid,uuid,jsonb)','EXECUTE')
  and has_function_privilege('service_role','import_initial_products(uuid,uuid,jsonb)','EXECUTE'),'import RPC is server-only');
select ok((select relrowsecurity from pg_class where oid='public.initial_product_import_requests'::regclass),'import idempotency table has RLS enabled');

select * from finish();
rollback;
