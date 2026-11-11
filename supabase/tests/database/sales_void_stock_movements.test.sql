begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);

insert into categories(id,name) values('ae100000-0000-4000-8000-000000000001','Sales movement category');
insert into products(id,sku,name,base_unit,category_id) values
('ae300000-0000-4000-8000-000000000001','SALES-VOID-STEP5C1','Sales movement product','Tablet','ae100000-0000-4000-8000-000000000001');
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('ae400000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000001','Tablet',1,100,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at) values
('ae500000-0000-4000-8000-000000000001','ae300000-0000-4000-8000-000000000001','FEFO-A','2030-01-01',5,50,'2026-01-01'),
('ae500000-0000-4000-8000-000000000002','ae300000-0000-4000-8000-000000000001','FEFO-B','2030-02-01',100,50,'2026-01-02');
insert into employees(id,full_name,position) values
('ae600000-0000-4000-8000-000000000001','Kasir Sales Movement','kasir');
create temporary table movement_tx(kind text primary key,id uuid);

insert into movement_tx values('completed',(public.checkout_transaction(
  'ae600000-0000-4000-8000-000000000001','cash',
  '[{"product_unit_id":"ae400000-0000-4000-8000-000000000001","quantity":2}]',200,null)->>'transaction_id')::uuid);
insert into movement_tx values('pending',(public.checkout_transaction(
  'ae600000-0000-4000-8000-000000000001','qris',
  '[{"product_unit_id":"ae400000-0000-4000-8000-000000000001","quantity":1}]',null,null)->>'transaction_id')::uuid);
insert into movement_tx values('voided',(public.checkout_transaction(
  'ae600000-0000-4000-8000-000000000001','cash',
  '[{"product_unit_id":"ae400000-0000-4000-8000-000000000001","quantity":3}]',300,null)->>'transaction_id')::uuid);
select public.void_transaction((select id from movement_tx where kind='voided'),'ae600000-0000-4000-8000-000000000001','Penjualan dibatalkan');
update transactions set voided_at='2026-11-06 14:30:00+07' where id=(select id from movement_tx where kind='voided');

-- A transaction row without allocation never changed stock and must not create an event.
insert into transactions(id,invoice_number,business_date,cashier_id,subtotal,tax_amount,total_amount,payment_method,status)
values('ae700000-0000-4000-8000-000000000001','NO-STOCK-DEDUCTION','2026-11-06','ae600000-0000-4000-8000-000000000001',0,0,0,'qris','pending_payment');

create temporary table sales_movement_result as
select product_stock_movement_read_model('ae300000-0000-4000-8000-000000000001',1,100) data;
create temporary table sales_movement_rows as
select value from jsonb_array_elements((select data->'rows' from sales_movement_result));

select is(((select data from sales_movement_result)->>'total')::integer,6,'actual allocations plus void restorations produce six events');
select is((select count(*) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='completed') and r.value->>'type'='out'),1::bigint,'completed sale produces stock out');
select is((select count(*) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='pending') and r.value->>'type'='out'),1::bigint,'instant QRIS allocation produces stock out');
select is((select count(*) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='voided') and r.value->>'type'='out'),2::bigint,'voided multi-batch sale retains both stock-out allocations');
select is((select count(*) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='voided') and r.value->>'type'='void'),2::bigint,'void creates one restoration per original allocation');
select is((select sum((r.value->>'quantity')::integer) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='voided') and r.value->>'type'='out'),3::bigint,'voided sale stock-out quantity matches checkout');
select is((select sum((r.value->>'quantity')::integer) from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='voided') and r.value->>'type'='void'),3::bigint,'void restoration exactly matches original allocations');
select is((select count(*) from sales_movement_rows where value->>'referenceNumber'='NO-STOCK-DEDUCTION'),0::bigint,'transaction without allocation creates no fictitious event');
select is((select count(distinct value->>'eventId') from sales_movement_rows),6::bigint,'all event IDs are unique without duplicates');
select is((select count(distinct value->>'referenceUrl') from sales_movement_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from movement_tx where kind='voided')),1::bigint,'multi-batch sale and void share one transaction reference');
select is((select (value->>'occurredAt')::timestamptz from sales_movement_rows where value->>'type'='void' limit 1),'2026-11-06 14:30:00+07'::timestamptz,'void uses actual void timestamp');
select ok(not exists(select 1 from jsonb_array_elements(product_stock_movement_read_model('ae300000-0000-4000-8000-000000000001',1,100,'void',null,null)->'rows') row where row->>'type'<>'void'),'void filter excludes sales rows');
select * from finish();
rollback;
