begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);
insert into categories(id,name) values('d1000000-0000-0000-0000-000000000001','Initial Stock Category');
insert into subcategories(id,category_id,name) values('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Initial Stock Subcategory');

select lives_ok($$select create_product_with_base_unit_and_initial_stock('INIT-001','Initial stock product','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Tablet','Tablet',1332,null,null,null,null,null,null,1000,11,false,'otc',0,true,'00123','{"expired_date":"2030-01-01","quantity":100}')$$,'creates product, base unit, and initial batch atomically');
select ok((select conversion_to_base=1 and is_base_unit from product_units u join products p on p.id=u.product_id where p.sku='INIT-001'),'initial selling unit remains the base unit');
select is((select quantity from product_batches pb join products p on p.id=pb.product_id where p.sku='INIT-001'),100,'initial quantity is stored in product_batches');
select ok((select pb.batch_number like 'INIT-%' from product_batches pb join products p on p.id=pb.product_id where p.sku='INIT-001'),'initial batch number is generated server-side');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='quantity'),'quantity is not stored on products');
select is((select pb.cost_price from product_batches pb join products p on p.id=pb.product_id where p.sku='INIT-001'),1000::numeric,'initial batch cost is derived from product cost price');

select lives_ok($$select create_product_with_base_unit('INIT-002','No initial stock','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Tablet','Tablet',1000)$$,'existing create RPC remains compatible without stock');
select is((select count(*)::integer from product_batches pb join products p on p.id=pb.product_id where p.sku='INIT-002'),0,'no initial stock creates no batch and leaves stock at zero');

select throws_ok($$select create_product_with_base_unit_and_initial_stock('INIT-BAD','Invalid batch product','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Tablet','Tablet',1000,null,null,null,null,null,null,0,0,false,'otc',0,true,null,'{"expired_date":"2030-01-01","quantity":0}')$$,'P0001','INVALID_BATCH','invalid initial quantity is rejected');
select is((select count(*)::integer from products where sku='INIT-BAD'),0,'invalid initial batch rolls back product creation');
select throws_ok($$select create_product_with_base_unit_and_initial_stock('INIT-EXPIRED','Expired batch product','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Tablet','Tablet',1000,null,null,null,null,null,null,0,0,false,'otc',0,true,null,'{"expired_date":"2000-01-01","quantity":1}')$$,'P0001','EXPIRED_BATCH','expired initial batch is rejected');
select is((select count(*)::integer from products where sku='INIT-EXPIRED'),0,'expired initial batch rolls back product creation');
select * from finish();
rollback;
