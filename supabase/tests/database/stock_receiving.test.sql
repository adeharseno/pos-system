begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);
insert into categories(id,name) values ('b1000000-0000-0000-0000-000000000001','Receiving');
insert into subcategories(id,category_id,name) values ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Receiving');
insert into employees(id,full_name,position) values ('b3000000-0000-0000-0000-000000000001','Owner','owner_admin');
insert into products(id,sku,name,category_id,subcategory_id,base_unit,is_active) values
 ('b4000000-0000-0000-0000-000000000001','REC-A','Active','b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','tablet',true),
 ('b4000000-0000-0000-0000-000000000002','REC-I','Inactive','b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','tablet',false);
select lives_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"ONE","expired_date":"2030-01-01","quantity":10,"cost_price":100}]')$$,'receives one batch');
select is((select quantity from product_batches where product_id='b4000000-0000-0000-0000-000000000001' and batch_number='ONE'),10,'single batch quantity stored');
select is((select (receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"TWO","expired_date":"2030-02-01","quantity":2,"cost_price":10},{"batch_number":"THREE","expired_date":"2030-03-01","quantity":3,"cost_price":20}]')->>'batch_count')::integer),2,'receives multiple batches');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"ROLLBACK","expired_date":"2030-01-01","quantity":1,"cost_price":1},{"batch_number":"BAD","expired_date":"2030-01-01","quantity":0,"cost_price":1}]')$$,'P0001','INVALID_BATCH','invalid line rejects receipt');
select is((select count(*)::integer from product_batches where product_id='b4000000-0000-0000-0000-000000000001' and batch_number='ROLLBACK'),0,'invalid multi-batch receipt rolls back fully');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"NEGATIVE","expired_date":"2030-01-01","quantity":-1,"cost_price":1}]')$$,'P0001','INVALID_BATCH','negative quantity rejected');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"NEG-COST","expired_date":"2030-01-01","quantity":1,"cost_price":-1}]')$$,'P0001','INVALID_BATCH','negative cost rejected');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"OLD","expired_date":"2000-01-01","quantity":1,"cost_price":1}]')$$,'P0001','EXPIRED_BATCH','expired batch rejected');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"ONE","expired_date":"2030-01-01","quantity":1,"cost_price":1}]')$$,'P0001','DUPLICATE_BATCH','existing batch key rejected');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000002','[{"batch_number":"INACTIVE","expired_date":"2030-01-01","quantity":1,"cost_price":1}]')$$,'P0001','PRODUCT_INACTIVE','inactive product rejected');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000099','[{"batch_number":"MISSING","expired_date":"2030-01-01","quantity":1,"cost_price":1}]')$$,'P0001','PRODUCT_NOT_FOUND','missing product rejected');
insert into stock_opname_sessions(id,created_by,status) values ('b5000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','in_progress');
select throws_ok($$select receive_product_stock('b3000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','[{"batch_number":"FROZEN","expired_date":"2030-01-01","quantity":1,"cost_price":1}]')$$,'P0001','STOCK_OPNAME_IN_PROGRESS','opname freezes receiving');
select * from finish();
rollback;
