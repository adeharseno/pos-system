begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

insert into categories(id,name) values('e1100000-0000-4000-8000-000000000001','Manual movement');
insert into products(id,sku,name,base_unit,category_id) values
('e1300000-0000-4000-8000-000000000001','MANUAL-MOVEMENT-0041','Manual movement product','Tablet','e1100000-0000-4000-8000-000000000001');
insert into employees(id,full_name,position) values
('e1600000-0000-4000-8000-000000000001','Owner Manual Movement','owner_admin');
insert into suppliers(id,name) values
('e1700000-0000-4000-8000-000000000001','Supplier Manual Movement');

select receive_product_stock_manual(
  'e1800000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-MOVE-A","expired_date":"2030-01-01","quantity":7,"cost_price":50},{"batch_number":"MANUAL-MOVE-B","expired_date":"2030-02-01","quantity":11,"cost_price":60}]',
  'Penambahan darurat',
  'e1700000-0000-4000-8000-000000000001',
  'REF-MANUAL-0041'
);
select receive_product_stock_manual(
  'e1800000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-MOVE-A","expired_date":"2030-01-01","quantity":7,"cost_price":50},{"batch_number":"MANUAL-MOVE-B","expired_date":"2030-02-01","quantity":11,"cost_price":60}]',
  'Penambahan darurat',
  'e1700000-0000-4000-8000-000000000001',
  'REF-MANUAL-0041'
);

select receive_product_stock(
  'e1600000-0000-4000-8000-000000000001',
  'e1300000-0000-4000-8000-000000000001',
  '[{"batch_number":"LEGACY-NO-EVENT","expired_date":"2030-03-01","quantity":99,"cost_price":70}]'
);

update manual_stock_receiving_events mse set occurred_at=case pb.batch_number
  when 'MANUAL-MOVE-A' then '2026-11-06 23:59:59+07'::timestamptz
  else '2026-11-07 00:00:00+07'::timestamptz end
from product_batches pb where pb.id=mse.batch_id and mse.request_id='e1800000-0000-4000-8000-000000000001';

create temporary table manual_movement_result as
select product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,100) data;
create temporary table manual_movement_rows as
select value from jsonb_array_elements((select data->'rows' from manual_movement_result))
where value->>'type'='manual_receiving';

select is(((select data from manual_movement_result)->>'total')::integer,2,'only committed immutable manual events are counted');
select is((select count(*) from manual_movement_rows),2::bigint,'retry does not duplicate movement events');
select is((select sum((value->>'quantity')::integer) from manual_movement_rows),18::bigint,'movement uses original received base-unit quantity');
select is((select count(*) from manual_movement_rows where value->>'eventId' like 'manual-receiving:%'),2::bigint,'manual event IDs use a unique namespace');
select is((select count(distinct value->>'eventId') from manual_movement_rows),2::bigint,'manual event IDs are stable and distinct per batch event');
select is((select count(*) from manual_movement_rows where value->>'employeeName'='Owner Manual Movement'),2::bigint,'actor is exposed');
select is((select count(*) from manual_movement_rows where value->>'supplierName'='Supplier Manual Movement'),2::bigint,'optional supplier is exposed');
select is((select count(*) from manual_movement_rows where value->>'referenceNumber'='REF-MANUAL-0041'),2::bigint,'optional reference is exposed');
select is((select count(*) from manual_movement_rows where value->>'reason'='Penambahan darurat'),2::bigint,'optional reason is exposed');
select is((select count(distinct value->>'batchNumber') from manual_movement_rows),2::bigint,'actual batch numbers are exposed');
select is((select count(*) from manual_movement_rows where value->'referenceUrl'='null'::jsonb),2::bigint,'manual receiving has no invented detail link');
select is((select count(*) from manual_movement_rows r join manual_stock_receiving_events mse on r.value->>'eventId'='manual-receiving:'||mse.id::text where (r.value->>'quantity')::integer=mse.quantity_base),2::bigint,'rows map directly to immutable event records');
select is(jsonb_array_length(product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,1)->'rows'),1,'manual events use database-side pagination');
select is(jsonb_array_length(product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',2,1)->'rows'),1,'next manual event page is available');
select cmp_ok(
  (product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,1)->'rows'->0->>'occurredAt')::timestamptz,
  '>',
  (product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',2,1)->'rows'->0->>'occurredAt')::timestamptz,
  'pagination remains newest-first'
);
select ok(not has_function_privilege('authenticated','product_stock_movement_read_model(uuid,integer,integer)','EXECUTE') and has_function_privilege('service_role','product_stock_movement_read_model(uuid,integer,integer)','EXECUTE'),'movement RPC remains server-only');
select is((product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,1,'manual_receiving',null,null)->>'total')::integer,2,'manual filter total is calculated before pagination');
select is(jsonb_array_length(product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,1,'manual_receiving',null,null)->'rows'),1,'filtered manual pagination keeps requested page size');
select is((product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,10,null,'2026-11-06','2026-11-06')->>'total')::integer,1,'WIB end date includes the final second of its calendar day');
select is((product_stock_movement_read_model('e1300000-0000-4000-8000-000000000001',1,10,null,'2026-11-07','2026-11-07')->>'total')::integer,1,'WIB start date begins at local midnight');

select * from finish();
rollback;
