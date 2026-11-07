begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(28);

insert into categories(id,name) values('e9100000-0000-4000-8000-000000000001','Initial anonymous stock');
insert into products(id,sku,name,base_unit,category_id,minimum_stock) values
('e9200000-0000-4000-8000-000000000001','INITIAL-ANONYMOUS','Initial anonymous product','Tablet','e9100000-0000-4000-8000-000000000001',3),
('e9200000-0000-4000-8000-000000000002','INITIAL-AUTH','Initial auth product','Tablet','e9100000-0000-4000-8000-000000000001',0),
('e9200000-0000-4000-8000-000000000003','INITIAL-ROLLBACK','Initial rollback product','Tablet','e9100000-0000-4000-8000-000000000001',0);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('e9300000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001','Tablet',1,100,true);
insert into employees(id,full_name,position) values
('e9400000-0000-4000-8000-000000000001','Initial Owner','owner_admin'),
('e9400000-0000-4000-8000-000000000002','Initial Cashier','kasir');

create temporary table initial_result as select receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001',10,25,'LEGACY-ROW-1'
) data;
select is((select data->>'replayed' from initial_result),'false','initial stock first request succeeds');
select ok((select batch_number is null and expired_date is null from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),'initial batch has no physical batch or expiry');
select is((select quantity from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),10,'initial quantity is exact');
select is((select cost_price from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),25::numeric,'initial cost is the explicit input');
select ok((select source='initial' and actor_id='e9400000-0000-4000-8000-000000000001' and payload->>'reference'='LEGACY-ROW-1' from manual_stock_receiving_requests where request_id='e9500000-0000-4000-8000-000000000001'),'request ledger records initial source and actor');
select ok((select e.source='initial' and e.quantity_base=10 and e.reason='Stok awal' and e.batch_id=b.id and e.occurred_at is not null from manual_stock_receiving_events e join product_batches b on b.id=e.batch_id where e.request_id='e9500000-0000-4000-8000-000000000001'),'immutable event references actual batch and timestamp');

select is(receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001',10,25,'LEGACY-ROW-1'
)->>'replayed','true','same request and payload replays');
select is((select quantity from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),10,'retry does not duplicate quantity');
select is((select count(*) from manual_stock_receiving_events where product_id='e9200000-0000-4000-8000-000000000001'),1::bigint,'retry does not duplicate event');
select throws_ok($$select receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001',11,25,'LEGACY-ROW-1')$$,
  'P0001','INITIAL_STOCK_REQUEST_CONFLICT','same request with changed payload conflicts');
select throws_ok($$select receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000002','e9400000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000001',1,25,null)$$,
  'P0001','INITIAL_STOCK_ALREADY_EXISTS','different request cannot initialize the same product twice');
select throws_ok($$select receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000003','e9400000-0000-4000-8000-000000000002',
  'e9200000-0000-4000-8000-000000000002',1,0,null)$$,
  'P0001','INVALID_EMPLOYEE','only owner admin can initialize stock');
select is((select count(*) from product_batches where product_id='e9200000-0000-4000-8000-000000000002'),0::bigint,'authorization failure leaves no batch');

select throws_ok($$select receive_product_stock(
  'e9400000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000003',
  '[{"batch_number":null,"expired_date":null,"quantity":1,"cost_price":0}]')$$,
  'P0001','INVALID_BATCH','manual receiving still requires a physical batch number');

insert into suppliers(id,name) values('e9600000-0000-4000-8000-000000000001','Initial supplier');
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by) values
('e9700000-0000-4000-8000-000000000001','e9600000-0000-4000-8000-000000000001','INITIAL-BATCH-REQUIRED','2026-11-07',10,'e9400000-0000-4000-8000-000000000001','e9400000-0000-4000-8000-000000000001');
select throws_ok($$select write_purchase_invoice_item(
  'e9700000-0000-4000-8000-000000000001','e9800000-0000-4000-8000-000000000001',gen_random_uuid(),
  'e9400000-0000-4000-8000-000000000001',null,'create',
  '{"product_id":"e9200000-0000-4000-8000-000000000001","product_unit_id":"e9300000-0000-4000-8000-000000000001","cost_price":"10","tax_rate":"0","selling_price":"100","pricing_mode":"selling_price","quantity":"1","batch_number":null,"expired_date":null}')$$,
  'P0001','INVALID_INVOICE_ITEM','invoice receiving still requires a physical batch number');

create temporary table stock_model as select stock_list_read_model('2026-11-07','INITIAL-ANONYMOUS','all','all','all','name_asc',1,20) data;
select is((select (value->>'availableStock')::integer from jsonb_array_elements((select data->'rows' from stock_model)) value),10,'inventory read model exposes anonymous initial stock');
select is((select value->>'nearestExpiry' from jsonb_array_elements((select data->'rows' from stock_model)) value),null::text,'anonymous stock has no invented nearest expiry');

create temporary table sale_one as select checkout_transaction(
  'e9400000-0000-4000-8000-000000000002','cash',
  '[{"product_unit_id":"e9300000-0000-4000-8000-000000000001","quantity":3}]',300,null
) data;
select is((select quantity from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),7,'checkout sells anonymous initial stock');
select ok((select tib.batch_id=b.id and tib.quantity_in_base=3 from transaction_item_batches tib join transaction_items ti on ti.id=tib.transaction_item_id join product_batches b on b.id=tib.batch_id join sale_one s on ti.transaction_id=(s.data->>'transaction_id')::uuid),'checkout allocation uses internal batch id');
select lives_ok($$select void_transaction(
  (select (data->>'transaction_id')::uuid from sale_one),'e9400000-0000-4000-8000-000000000002','Test void initial stock')$$,'void supports anonymous initial batch');
select is((select quantity from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),10,'void restores anonymous initial stock');

create temporary table sale_two as select checkout_transaction(
  'e9400000-0000-4000-8000-000000000002','cash',
  '[{"product_unit_id":"e9300000-0000-4000-8000-000000000001","quantity":2}]',200,null
) data;
select lives_ok($$select create_customer_return(
  'e9400000-0000-4000-8000-000000000002',(select (data->>'transaction_id')::uuid from sale_two),'cash','Test return initial stock',
  jsonb_build_array(jsonb_build_object('transaction_item_id',(select ti.id from transaction_items ti join sale_two s on ti.transaction_id=(s.data->>'transaction_id')::uuid),'quantity_in_base',2)))$$,'customer return supports anonymous initial batch');
select is((select quantity from product_batches where product_id='e9200000-0000-4000-8000-000000000001'),10,'customer return restores anonymous initial stock');

create temporary table opname as select start_stock_opname('e9400000-0000-4000-8000-000000000001',null) data;
select ok((select exists(select 1 from stock_opname_items oi join product_batches b on b.id=oi.batch_id where oi.session_id=(select (data->>'session_id')::uuid from opname) and b.product_id='e9200000-0000-4000-8000-000000000001' and b.batch_number is null)),'stock opname includes anonymous initial batch');
select lives_ok($$select cancel_stock_opname((select (data->>'session_id')::uuid from opname),'e9400000-0000-4000-8000-000000000001')$$,'anonymous batch opname can be cancelled normally');

select throws_ok($$select receive_initial_product_stock(
  'e9500000-0000-4000-8000-000000000004','e9400000-0000-4000-8000-000000000001',
  'e9200000-0000-4000-8000-000000000003',0,0,null)$$,
  'P0001','INVALID_INITIAL_STOCK','invalid quantity rolls back');
select is((select count(*) from manual_stock_receiving_requests where request_id='e9500000-0000-4000-8000-000000000004'),0::bigint,'invalid initial stock leaves no request ledger');
select ok(not has_function_privilege('authenticated','receive_initial_product_stock(uuid,uuid,uuid,integer,numeric,text)','EXECUTE') and has_function_privilege('service_role','receive_initial_product_stock(uuid,uuid,uuid,integer,numeric,text)','EXECUTE'),'initial stock RPC is server-only');

select * from finish();
rollback;
