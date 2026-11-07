begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(19);

insert into categories(id,name) values('d0100000-0000-4000-8000-000000000001','Manual receiving');
insert into products(id,sku,name,base_unit,category_id) values
('d0300000-0000-4000-8000-000000000001','MANUAL-RECEIVING-0040','Manual receiving product','Tablet','d0100000-0000-4000-8000-000000000001');
insert into employees(id,full_name,position) values
('d0600000-0000-4000-8000-000000000001','Owner Manual Receiving','owner_admin'),
('d0600000-0000-4000-8000-000000000002','Kasir Manual Receiving','kasir');
insert into suppliers(id,name) values('d0700000-0000-4000-8000-000000000001','Supplier Manual Receiving');

create temporary table first_result as select receive_product_stock_manual(
  'd0800000-0000-4000-8000-000000000001','d0600000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"MAN-A","expired_date":"2030-01-01","quantity":7,"cost_price":50},{"batch_number":"MAN-B","expired_date":"2030-02-01","quantity":11,"cost_price":60}]',
  'Stok manual','d0700000-0000-4000-8000-000000000001','REF-MANUAL-1') data;
select is((select data->>'replayed' from first_result),'false','first request is not a replay');
select is((select count(*) from manual_stock_receiving_requests where request_id='d0800000-0000-4000-8000-000000000001'),1::bigint,'one request ledger row stored');
select is((select count(*) from manual_stock_receiving_events where request_id='d0800000-0000-4000-8000-000000000001'),2::bigint,'one event per actual batch stored');
select is((select sum(quantity_base) from manual_stock_receiving_events where request_id='d0800000-0000-4000-8000-000000000001'),18::bigint,'original base-unit quantities are immutable');
select is((select sum(quantity) from product_batches where product_id='d0300000-0000-4000-8000-000000000001'),18::bigint,'actual batches received exact quantity');
select is((select count(*) from manual_stock_receiving_events e join product_batches b on b.id=e.batch_id where e.request_id='d0800000-0000-4000-8000-000000000001'),2::bigint,'events reference actual created batches');
select is((select count(*) from manual_stock_receiving_events where source='manual' and actor_id='d0600000-0000-4000-8000-000000000001' and supplier_id='d0700000-0000-4000-8000-000000000001' and reason='Stok manual' and reference='REF-MANUAL-1'),2::bigint,'audit metadata is retained');

select is(receive_product_stock_manual(
  'd0800000-0000-4000-8000-000000000001','d0600000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"MAN-A","expired_date":"2030-01-01","quantity":7,"cost_price":50},{"batch_number":"MAN-B","expired_date":"2030-02-01","quantity":11,"cost_price":60}]',
  'Stok manual','d0700000-0000-4000-8000-000000000001','REF-MANUAL-1')->>'replayed','true','same request and payload replays');
select is((select sum(quantity) from product_batches where product_id='d0300000-0000-4000-8000-000000000001'),18::bigint,'retry does not add stock twice');
select is((select count(*) from manual_stock_receiving_events where request_id='d0800000-0000-4000-8000-000000000001'),2::bigint,'retry does not duplicate events');
select throws_ok($$select receive_product_stock_manual(
  'd0800000-0000-4000-8000-000000000001','d0600000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"MAN-C","expired_date":"2030-03-01","quantity":99,"cost_price":50}]','Stok manual',null,null)$$,
  'P0001','MANUAL_RECEIVING_REQUEST_CONFLICT','same request with different payload conflicts');

select throws_ok($$select receive_product_stock_manual(
  'd0800000-0000-4000-8000-000000000002','d0600000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"ROLLBACK-A","expired_date":"2030-04-01","quantity":5,"cost_price":50},{"batch_number":"ROLLBACK-B","expired_date":"2020-01-01","quantity":6,"cost_price":50}]',null,null,null)$$,
  'P0001','EXPIRED_BATCH','invalid multi-batch request fails atomically');
select is((select count(*) from product_batches where batch_number like 'ROLLBACK-%'),0::bigint,'atomic failure leaves no batches');
select is((select count(*) from manual_stock_receiving_requests where request_id='d0800000-0000-4000-8000-000000000002'),0::bigint,'atomic failure leaves no request ledger');
select is((select count(*) from manual_stock_receiving_events where request_id='d0800000-0000-4000-8000-000000000002'),0::bigint,'atomic failure leaves no events');
select throws_ok($$select receive_product_stock_manual(
  'd0800000-0000-4000-8000-000000000003','d0600000-0000-4000-8000-000000000002','d0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"FORBIDDEN","expired_date":"2030-05-01","quantity":1,"cost_price":50}]',null,null,null)$$,
  'P0001','INVALID_EMPLOYEE','non-owner cannot receive manual stock');
select ok(not has_function_privilege('authenticated','receive_product_stock_manual(uuid,uuid,uuid,jsonb,text,uuid,text)','EXECUTE') and has_function_privilege('service_role','receive_product_stock_manual(uuid,uuid,uuid,jsonb,text,uuid,text)','EXECUTE'),'RPC is server-only');
select ok(has_table_privilege('service_role','manual_stock_receiving_events','SELECT') and not has_table_privilege('service_role','manual_stock_receiving_events','INSERT') and not has_table_privilege('service_role','manual_stock_receiving_events','UPDATE') and not has_table_privilege('service_role','manual_stock_receiving_events','DELETE'),'event rows are read-only to the application');
select receive_product_stock(
  'd0600000-0000-4000-8000-000000000001',
  'd0300000-0000-4000-8000-000000000001',
  '[{"batch_number":"NON-MANUAL","expired_date":"2030-06-01","quantity":3,"cost_price":70}]'
);
select is((select count(*) from manual_stock_receiving_events where product_id='d0300000-0000-4000-8000-000000000001'),2::bigint,'existing receiving path does not create manual events');
select * from finish();
rollback;
