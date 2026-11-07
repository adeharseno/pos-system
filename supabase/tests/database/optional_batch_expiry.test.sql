begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(16);

insert into categories(id,name) values('e7100000-0000-4000-8000-000000000001','Optional expiry');
insert into products(id,sku,name,base_unit,category_id,minimum_stock) values
('e7300000-0000-4000-8000-000000000001','OPTIONAL-EXPIRY-SALE','Optional expiry sale','Tablet','e7100000-0000-4000-8000-000000000001',5),
('e7300000-0000-4000-8000-000000000002','OPTIONAL-EXPIRY-REPORT','Optional expiry report','Tablet','e7100000-0000-4000-8000-000000000001',20);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('e7400000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000001','Tablet',1,100,true),
('e7400000-0000-4000-8000-000000000002','e7300000-0000-4000-8000-000000000002','Tablet',1,100,true);
insert into employees(id,full_name,position) values
('e7600000-0000-4000-8000-000000000001','Kasir Optional Expiry','kasir');

insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at) values
('e7500000-0000-4000-8000-000000000001','e7300000-0000-4000-8000-000000000001','EXPIRED','2020-01-01',50,10,'2026-01-01 00:00:00+07'),
('e7500000-0000-4000-8000-000000000002','e7300000-0000-4000-8000-000000000001','DATED-A','2030-01-01',2,20,'2026-01-02 00:00:00+07'),
('e7500000-0000-4000-8000-000000000003','e7300000-0000-4000-8000-000000000001','DATED-B','2031-01-01',2,30,'2026-01-03 00:00:00+07'),
('e7500000-0000-4000-8000-000000000004','e7300000-0000-4000-8000-000000000001','NO-EXPIRY',null,5,40,'2026-01-04 00:00:00+07'),
('e7500000-0000-4000-8000-000000000005','e7300000-0000-4000-8000-000000000002','REPORT-NULL',null,7,50,'2026-01-05 00:00:00+07');

select ok((select is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='product_batches' and column_name='expired_date'),'product batch expiry is nullable');
select throws_ok($$insert into product_batches(product_id,batch_number,expired_date,quantity,cost_price) values('e7300000-0000-4000-8000-000000000001','NO-EXPIRY',null,1,1)$$,'23505',null,'null-expiry batch identity remains unique');

create temporary table stock_model as
select stock_list_read_model('2026-11-07','OPTIONAL-EXPIRY-SALE','all','all','all','name_asc',1,20) data;
select is((select (value->>'availableStock')::integer from jsonb_array_elements((select data->'rows' from stock_model)) value),9,'stock read model includes null expiry and excludes expired');
select is((select value->>'nearestExpiry' from jsonb_array_elements((select data->'rows' from stock_model)) value),'2030-01-01','nearest expiry ignores unknown expiry');
select is((select (value->>'availableStock')::integer from jsonb_array_elements(dashboard_low_stock('2026-11-07')) value where value->>'id'='e7300000-0000-4000-8000-000000000002'),7,'dashboard includes null-expiry stock');
select is((select value->>'availableStock' from jsonb_array_elements(product_performance_report('2026-11-07','2026-11-07')->'unsold') value where value->>'productId'='e7300000-0000-4000-8000-000000000002'),'7','performance report includes null-expiry stock');

create temporary table cash_sale as select checkout_transaction(
  'e7600000-0000-4000-8000-000000000001','cash',
  '[{"product_unit_id":"e7400000-0000-4000-8000-000000000001","quantity":5}]',500,null
) data;
select is((select data->>'status' from cash_sale),'completed','cash checkout succeeds across dated and null-expiry batches');
select is((select quantity from product_batches where id='e7500000-0000-4000-8000-000000000001'),50,'expired batch is never sold');
select is((select quantity from product_batches where id='e7500000-0000-4000-8000-000000000002'),0,'nearest valid expiry is allocated first');
select is((select quantity from product_batches where id='e7500000-0000-4000-8000-000000000003'),0,'second valid expiry is allocated before null expiry');
select is((select quantity from product_batches where id='e7500000-0000-4000-8000-000000000004'),4,'null expiry is allocated last');
select is((select count(*) from transaction_item_batches tib join transaction_items ti on ti.id=tib.transaction_item_id join cash_sale s on ti.transaction_id=(s.data->>'transaction_id')::uuid),3::bigint,'multi-batch allocation records one row per actual batch');

create temporary table qris_sale as select checkout_transaction(
  'e7600000-0000-4000-8000-000000000001','qris',
  '[{"product_unit_id":"e7400000-0000-4000-8000-000000000001","quantity":2}]',null,null
) data;
select is((select data->>'status' from qris_sale),'pending_payment','QRIS remains pending while reserving stock');
select is((select quantity from product_batches where id='e7500000-0000-4000-8000-000000000004'),2,'QRIS allocates null-expiry stock immediately');
select is((select sum(tib.quantity_in_base) from transaction_item_batches tib join transaction_items ti on ti.id=tib.transaction_item_id join qris_sale s on ti.transaction_id=(s.data->>'transaction_id')::uuid),2::bigint,'QRIS allocation snapshot has exact quantity');
select throws_ok($$select checkout_transaction('e7600000-0000-4000-8000-000000000001','cash','[{"product_unit_id":"e7400000-0000-4000-8000-000000000001","quantity":3}]',300,null)$$,'P0001','INSUFFICIENT_STOCK','expired stock cannot satisfy checkout');

select * from finish();
rollback;
