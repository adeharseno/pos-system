begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);

insert into categories(id,name) values('c0100000-0000-4000-8000-000000000001','Opname movement');
insert into products(id,sku,name,base_unit,category_id) values
('c0300000-0000-4000-8000-000000000001','OPNAME-STEP5C4','Opname movement product','Tablet','c0100000-0000-4000-8000-000000000001');
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values
('c0500000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001','OPNAME-POS','2030-01-01',5,50),
('c0500000-0000-4000-8000-000000000002','c0300000-0000-4000-8000-000000000001','OPNAME-NEG','2030-02-01',10,50),
('c0500000-0000-4000-8000-000000000003','c0300000-0000-4000-8000-000000000001','OPNAME-ZERO','2030-03-01',4,50);
insert into employees(id,full_name,position) values('c0600000-0000-4000-8000-000000000001','Owner Stock Opname','owner_admin');

insert into stock_opname_sessions(id,created_by) values('c0800000-0000-4000-8000-000000000001','c0600000-0000-4000-8000-000000000001');
insert into stock_opname_items(id,session_id,product_id,batch_id,system_quantity,physical_quantity) values
('c0900000-0000-4000-8000-000000000001','c0800000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001',5,7),
('c0900000-0000-4000-8000-000000000002','c0800000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000002',10,7),
('c0900000-0000-4000-8000-000000000003','c0800000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000003',4,4);
select apply_stock_opname('c0800000-0000-4000-8000-000000000001','c0600000-0000-4000-8000-000000000001');
update stock_opname_sessions set applied_at='2026-11-06 16:00:00+07' where id='c0800000-0000-4000-8000-000000000001';

insert into stock_opname_sessions(id,created_by) values('c0800000-0000-4000-8000-000000000002','c0600000-0000-4000-8000-000000000001');
insert into stock_opname_items(id,session_id,product_id,batch_id,system_quantity,physical_quantity)
values('c0900000-0000-4000-8000-000000000004','c0800000-0000-4000-8000-000000000002','c0300000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001',7,99);
select cancel_stock_opname('c0800000-0000-4000-8000-000000000002','c0600000-0000-4000-8000-000000000001');

create temporary table opname_rows as
select value from jsonb_array_elements(product_stock_movement_read_model('c0300000-0000-4000-8000-000000000001',1,100)->'rows')
where value->>'type' in ('stock_opname_in','stock_opname_out');

select is((select count(*) from opname_rows),2::bigint,'only non-zero applied adjustments create events');
select is((select (value->>'quantity')::integer from opname_rows where value->>'type'='stock_opname_in'),2,'positive variance uses actual delta');
select is((select (value->>'quantity')::integer from opname_rows where value->>'type'='stock_opname_out'),3,'negative variance uses absolute actual delta');
select is((select count(*) from opname_rows where value->>'eventId'='stock-opname:c0900000-0000-4000-8000-000000000003'),0::bigint,'zero variance creates no event');
select is((select count(*) from opname_rows where value->>'eventId'='stock-opname:c0900000-0000-4000-8000-000000000004'),0::bigint,'cancelled opname creates no event');
select is((select count(distinct value->>'eventId') from opname_rows),2::bigint,'opname event IDs are stable and unique');
select is((select count(distinct value->>'referenceNumber') from opname_rows),1::bigint,'multi-batch adjustments share one opname reference');
select is((select value->>'employeeName' from opname_rows limit 1),'Owner Stock Opname','applied-by employee is included');
select is((select count(*) from opname_rows where value->'referenceUrl'='null'::jsonb),2::bigint,'no unavailable opname detail link is invented');
select is((select count(*) from opname_rows where (value->>'occurredAt')::timestamptz='2026-11-06 16:00:00+07'::timestamptz),2::bigint,'events use actual applied timestamp');
select is((select count(*) from opname_rows r join stock_opname_items oi on r.value->>'eventId'='stock-opname:'||oi.id::text where (r.value->>'quantity')::integer=abs(oi.variance)),2::bigint,'event quantity is stored per-batch variance, not physical total');
select is((product_stock_movement_read_model('c0300000-0000-4000-8000-000000000001',1,100,'stock_opname',null,null)->>'total')::integer,2,'stock opname filter includes both positive and negative adjustments');
select * from finish();
rollback;
