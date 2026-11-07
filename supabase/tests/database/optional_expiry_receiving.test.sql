begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(26);

insert into employees(id,full_name,position) values
('e8100000-0000-4000-8000-000000000001','Optional Receiving Owner','owner_admin'),
('e8100000-0000-4000-8000-000000000002','Optional Receiving Cashier','kasir');
insert into suppliers(id,name) values('e8200000-0000-4000-8000-000000000001','Optional Receiving Supplier');
insert into categories(id,name) values('e8300000-0000-4000-8000-000000000001','Optional Receiving Category');
insert into products(id,sku,name,base_unit,category_id,cost_price) values
('e8400000-0000-4000-8000-000000000001','OPTIONAL-RECEIVING','Optional Receiving Product','Tablet','e8300000-0000-4000-8000-000000000001',5);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('e8500000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001','Tablet',1,20,true);

create temporary table manual_null as select receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-NULL","expired_date":null,"quantity":7,"cost_price":5}]','Tanpa tanggal',null,null
) data;
select is((select data->>'replayed' from manual_null),'false','manual null-expiry receiving succeeds');
select is((select quantity from product_batches where product_id='e8400000-0000-4000-8000-000000000001' and batch_number='MANUAL-NULL' and expired_date is null),7,'manual null-expiry quantity is exact');
select is((select count(*) from manual_stock_receiving_events where request_id='e8600000-0000-4000-8000-000000000001'),1::bigint,'manual null-expiry creates one event');
select ok((select e.batch_id=b.id and e.quantity_base=7 from manual_stock_receiving_events e join product_batches b on b.id=e.batch_id where e.request_id='e8600000-0000-4000-8000-000000000001'),'manual event references actual null-expiry batch');
select is(receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-NULL","expired_date":null,"quantity":7,"cost_price":5}]','Tanpa tanggal',null,null
)->>'replayed','true','manual retry replays');
select is((select quantity from product_batches where batch_number='MANUAL-NULL' and product_id='e8400000-0000-4000-8000-000000000001'),7,'manual retry does not add stock');
select is((select count(*) from manual_stock_receiving_events where request_id='e8600000-0000-4000-8000-000000000001'),1::bigint,'manual retry does not duplicate event');
select throws_ok($$select receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-NULL","expired_date":null,"quantity":8,"cost_price":5}]','Tanpa tanggal',null,null)$$,
  'P0001','MANUAL_RECEIVING_REQUEST_CONFLICT','manual payload conflict is rejected');
select lives_ok($$select receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000002','e8100000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"MANUAL-DATED","expired_date":"2035-01-01","quantity":3,"cost_price":6}]',null,null,null)$$,
  'manual dated receiving remains supported');
select is((select quantity from product_batches where batch_number='MANUAL-DATED' and expired_date='2035-01-01'),3,'manual dated quantity remains exact');
select throws_ok($$select receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000003','e8100000-0000-4000-8000-000000000002','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"FORBIDDEN","expired_date":null,"quantity":1,"cost_price":5}]',null,null,null)$$,
  'P0001','INVALID_EMPLOYEE','manual receiving authorization is preserved');
select throws_ok($$select receive_product_stock_manual(
  'e8600000-0000-4000-8000-000000000004','e8100000-0000-4000-8000-000000000001','e8400000-0000-4000-8000-000000000001',
  '[{"batch_number":"ROLLBACK-NULL","expired_date":null,"quantity":2,"cost_price":5},{"batch_number":"ROLLBACK-OLD","expired_date":"2020-01-01","quantity":2,"cost_price":5}]',null,null,null)$$,
  'P0001','EXPIRED_BATCH','mixed invalid manual request rolls back atomically');
select is((select count(*) from product_batches where batch_number like 'ROLLBACK-%'),0::bigint,'manual rollback leaves no batch');
select is((select count(*) from manual_stock_receiving_requests where request_id='e8600000-0000-4000-8000-000000000004'),0::bigint,'manual rollback leaves no request ledger');

insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by) values
('e8700000-0000-4000-8000-000000000001','e8200000-0000-4000-8000-000000000001','OPTIONAL-EXPIRY-INVOICE','2026-11-07',30,'e8100000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001');
create function pg_temp.invoice_payload() returns jsonb language sql as $$select '{"product_id":"e8400000-0000-4000-8000-000000000001","product_unit_id":"e8500000-0000-4000-8000-000000000001","cost_price":"10.00","tax_rate":"0","selling_price":"20.00","margin_percent":null,"pricing_mode":"selling_price","quantity":"3","batch_number":"INVOICE-NULL","expired_date":null}'::jsonb$$;
select lives_ok($$select write_purchase_invoice_item(
  'e8700000-0000-4000-8000-000000000001','e8800000-0000-4000-8000-000000000001','e8900000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001',null,'create',pg_temp.invoice_payload())$$,
  'invoice draft accepts null expiry');
select ok((select expired_date is null and batch_number='INVOICE-NULL' from purchase_invoice_items where id='e8800000-0000-4000-8000-000000000001'),'invoice draft stores null without changing batch number');
select is(write_purchase_invoice_item(
  'e8700000-0000-4000-8000-000000000001','e8800000-0000-4000-8000-000000000001','e8900000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001',null,'create',pg_temp.invoice_payload()
)->>'replayed','true','invoice item retry replays');
select throws_ok($$select write_purchase_invoice_item(
  'e8700000-0000-4000-8000-000000000001','e8800000-0000-4000-8000-000000000001','e8900000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001',null,'create',pg_temp.invoice_payload()||'{"quantity":"4"}')$$,
  'P0001','INVOICE_REQUEST_CONFLICT','invoice item payload conflict is rejected');
select throws_ok($$select write_purchase_invoice_item(
  'e8700000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),'e8100000-0000-4000-8000-000000000002',null,'create',pg_temp.invoice_payload())$$,
  'P0001','FORBIDDEN','invoice item authorization is preserved');

create temporary table invoice_plan as select preview_purchase_receiving('e8700000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001') data;
create temporary table invoice_finish as select finalize_purchase_receiving(
  'e8700000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
  (select (data->>'version')::integer from invoice_plan),(select data->>'token' from invoice_plan),true
) data;
select is((select data->>'replayed' from invoice_finish),'false','invoice null-expiry finalization succeeds');
select is((select quantity from product_batches where product_id='e8400000-0000-4000-8000-000000000001' and batch_number='INVOICE-NULL' and expired_date is null),3,'invoice creates exact null-expiry batch quantity');
select is((select count(*) from purchase_invoice_receipts where invoice_id='e8700000-0000-4000-8000-000000000001'),1::bigint,'invoice creates one receipt');
select ok((select r.batch_id=b.id from purchase_invoice_receipts r join product_batches b on b.id=r.batch_id where r.invoice_id='e8700000-0000-4000-8000-000000000001' and b.expired_date is null),'invoice receipt references actual null-expiry batch');
select is(finalize_purchase_receiving(
  'e8700000-0000-4000-8000-000000000001','e8100000-0000-4000-8000-000000000001','e8a00000-0000-4000-8000-000000000001',
  (select (data->>'version')::integer from invoice_plan),(select data->>'token' from invoice_plan),true
)->>'replayed','true','invoice finalization retry replays');
select is((select count(*) from purchase_invoice_receipts where invoice_id='e8700000-0000-4000-8000-000000000001'),1::bigint,'invoice retry does not duplicate receipt');
select is((select count(*) from manual_stock_receiving_events where product_id='e8400000-0000-4000-8000-000000000001'),2::bigint,'invoice receiving creates no manual event');

select * from finish();
rollback;
