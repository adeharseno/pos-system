begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(13);

create temporary table test_owner as select id from employees where position='owner_admin' and is_active limit 1;
select is((select count(*) from test_owner),1::bigint,'active owner exists');

create temporary table imported as select import_initial_products(
  'f4700000-0000-4000-8000-000000000001',(select id from test_owner),
  '[{"sku":"INT-00002","name":"Unit Pending","base_unit":null,"selling_price":1000,"cost_price":0,"stock":10,"category_name":"Obat Bebas","subcategory_name":null,"supplier_text":"Supplier Legacy","drug_classification":"otc"},{"sku":"INT-00003","name":"Unassigned","base_unit":null,"selling_price":2000,"cost_price":0,"stock":10,"category_name":null,"subcategory_name":null,"supplier_text":null,"drug_classification":"otc"}]'::jsonb
) result;
select is((select count(*) from products where sku like 'INT-%'),2::bigint,'incomplete products import');
select ok((select base_unit is null and not unit_confirmed from products where sku='INT-00002'),'unknown unit is explicit');
select ok((select category_id is null and subcategory_id is null and classification_pending from products where sku='INT-00003'),'category can remain unassigned');
select is((select legacy_supplier_text from products where sku='INT-00002'),'Supplier Legacy','legacy supplier text preserved');
select is((select quantity from product_batches b join products p on p.id=b.product_id where p.sku='INT-00002'),10,'initial stock exact');
select ok((select batch_number is null and expired_date is null from product_batches b join products p on p.id=b.product_id where p.sku='INT-00002'),'initial batch stays anonymous');

insert into product_units(product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
select id,'BYPASS',1,1000,true from products where sku='INT-00002';
select throws_ok(format($sql$select checkout_transaction(%L::uuid,'cash','[{"product_unit_id":"%s","quantity":1}]'::jsonb,1000,null)$sql$,
  (select id from test_owner),(select u.id from product_units u join products p on p.id=u.product_id where p.sku='INT-00002')),'P0001','PRODUCT_UNIT_NOT_CONFIRMED','checkout RPC blocked at database level');
delete from product_units where product_id=(select id from products where sku='INT-00002');
select throws_ok(format($sql$select confirm_initial_product_unit(%L::uuid,%L::uuid,'Botol',1000,9)$sql$,(select id from test_owner),(select id from products where sku='INT-00002')),'P0001','STOCK_CONFIRMATION_MISMATCH','stock must be confirmed');
select is((select confirm_initial_product_unit((select id from test_owner),(select id from products where sku='INT-00002'),'Botol',1000,10)->>'stock_confirmed'),'10','owner confirms exact stock and unit');
select ok((select unit_confirmed and base_unit='Botol' from products where sku='INT-00002'),'unit confirmation enables product state');
select lives_ok(format($sql$select checkout_transaction(%L::uuid,'cash','[{"product_unit_id":"%s","quantity":1}]'::jsonb,1000,null)$sql$,
  (select id from test_owner),(select u.id from product_units u join products p on p.id=u.product_id where p.sku='INT-00002')),'confirmed product can be sold');
select is((select count(*) from manual_stock_receiving_events where source='initial' and product_id in(select id from products where sku like 'INT-%')),2::bigint,'initial ledger events retained');
select * from finish();
rollback;
