begin;
select plan(61);

insert into public.categories(id,name) values ('10000000-0000-0000-0000-000000000001','Test');
insert into public.subcategories(id,name) values ('10000000-0000-0000-0000-000000000002','Test');
insert into public.storage_locations(id,zone_code,rack_code,level_code,full_code)
values ('10000000-0000-0000-0000-000000000003','Z','R','L','Z-R-L');
insert into public.products(id,sku,name,category_id,subcategory_id,base_unit,storage_location_id)
values
 ('20000000-0000-0000-0000-000000000001','A','Product A','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','tablet','10000000-0000-0000-0000-000000000003'),
 ('20000000-0000-0000-0000-000000000002','B','Product B','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','tablet','10000000-0000-0000-0000-000000000003');
insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','box',100,10000,false),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','tablet',1,120,true),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','tablet',1,500,true);
insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at)
values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','A1','2028-01-01',30,50,'2026-01-01'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','A2','2029-01-01',200,60,'2026-01-02'),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','B1','2029-01-01',50,300,'2026-01-01');
insert into public.employees(id,full_name,position) values
 ('50000000-0000-0000-0000-000000000001','Cashier','kasir'),
 ('50000000-0000-0000-0000-000000000002','Owner','owner_admin');

create temporary table rpc_state(key text primary key, id uuid);

insert into rpc_state values ('cash_tx',(
  public.checkout_transaction('50000000-0000-0000-0000-000000000001','cash',
    '[{"product_unit_id":"30000000-0000-0000-0000-000000000001","quantity":1}]',20000,null)->>'transaction_id')::uuid);
select is((select status::text from public.transactions where id=(select id from rpc_state where key='cash_tx')),'completed','cash checkout completes');
select is((select cash_change from public.transactions where id=(select id from rpc_state where key='cash_tx')),10000::numeric,'cash change is server calculated');
select is((select count(*)::integer from public.transaction_item_batches tib join public.transaction_items ti on ti.id=tib.transaction_item_id where ti.transaction_id=(select id from rpc_state where key='cash_tx')),2,'FEFO can split one receipt line');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000001'),0,'earliest batch consumed first');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000002'),130,'split remainder consumed from next batch');
select is((select product_name_snapshot from public.transaction_items where transaction_id=(select id from rpc_state where key='cash_tx')),'Product A','checkout stores authoritative product label snapshot');
select is((select unit_name_snapshot from public.transaction_items where transaction_id=(select id from rpc_state where key='cash_tx')),'box','checkout stores authoritative unit label snapshot');
update public.products set name='Product A Renamed' where id='20000000-0000-0000-0000-000000000001';
update public.product_units set unit_name='carton' where id='30000000-0000-0000-0000-000000000001';
select is((select product_name_snapshot from public.transaction_items where transaction_id=(select id from rpc_state where key='cash_tx')),'Product A','product rename does not alter historical receipt label');
select is((select unit_name_snapshot from public.transaction_items where transaction_id=(select id from rpc_state where key='cash_tx')),'box','unit rename does not alter historical receipt label');

insert into rpc_state values ('qris_tx',(
  public.checkout_transaction('50000000-0000-0000-0000-000000000001','qris',
    '[{"product_unit_id":"30000000-0000-0000-0000-000000000003","quantity":5}]',null,null)->>'transaction_id')::uuid);
select is((select status::text from public.transactions where id=(select id from rpc_state where key='qris_tx')),'completed','QRIS checkout completes immediately');
select ok((select cash_received is null and cash_change is null and payment_confirmed_at is not null and payment_confirmed_by is not null from public.transactions where id=(select id from rpc_state where key='qris_tx')),'QRIS confirms immediately with no cash data');
select is((select count(*)::integer from public.transaction_item_batches tib join public.transaction_items ti on ti.id=tib.transaction_item_id where ti.transaction_id=(select id from rpc_state where key='qris_tx')),1,'FEFO supports a single eligible batch');
select is((select count(distinct invoice_number)::integer from public.transactions where id in (select id from rpc_state where key in ('cash_tx', 'qris_tx'))),2,'generated invoices are unique');
select throws_ok($$select public.checkout_transaction('50000000-0000-0000-0000-000000000001','cash','[{"product_unit_id":"30000000-0000-0000-0000-000000000003","quantity":100}]',999999,null)$$,'P0001','INSUFFICIENT_STOCK','insufficient stock rejected');
select throws_ok($$select public.checkout_transaction('50000000-0000-0000-0000-000000000001','cash','[{"product_unit_id":"39999999-0000-0000-0000-000000000099","quantity":1}]',1000,null)$$,'P0001','INVALID_PRODUCT_UNIT','invalid product unit rejected');

insert into rpc_state values ('qris_legacy_tx', '61000000-0000-0000-0000-000000000001');
insert into public.transactions(id,invoice_number,cashier_id,subtotal,tax_amount,total_amount,payment_method,status)
values ('61000000-0000-0000-0000-000000000001','INV-LEGACY-QRIS-001','50000000-0000-0000-0000-000000000001',500,0,500,'qris','pending_payment');
select lives_ok(format('select public.confirm_qris_payment(%L,%L)',(select id from rpc_state where key='qris_legacy_tx'),'50000000-0000-0000-0000-000000000001'),'legacy pending QRIS confirmation succeeds');
select is((select status::text from public.transactions where id=(select id from rpc_state where key='qris_legacy_tx')),'completed','legacy pending QRIS becomes completed');
select throws_ok(format('select public.confirm_qris_payment(%L,%L)',(select id from rpc_state where key='qris_tx'),'50000000-0000-0000-0000-000000000001'),'P0001','QRIS_ALREADY_CONFIRMED','repeat confirmation rejected');
select throws_ok(format('select public.confirm_qris_payment(%L,%L)',(select id from rpc_state where key='cash_tx'),'50000000-0000-0000-0000-000000000001'),'P0001','NOT_MANUAL_PAYMENT_TRANSACTION','cash cannot be manually confirmed');

insert into rpc_state values ('bank_tx',(
  public.checkout_transaction('50000000-0000-0000-0000-000000000001','bank_transfer',
    '[{"product_unit_id":"30000000-0000-0000-0000-000000000003","quantity":2}]',null,null)->>'transaction_id')::uuid);
select is((select status::text from public.transactions where id=(select id from rpc_state where key='bank_tx')),'completed','bank transfer checkout completes immediately');
select ok((select cash_received is null and cash_change is null and payment_confirmed_at is not null and payment_confirmed_by is not null from public.transactions where id=(select id from rpc_state where key='bank_tx')),'bank transfer confirms immediately with no cash data');
insert into rpc_state values ('bank_legacy_tx', '61000000-0000-0000-0000-000000000002');
insert into public.transactions(id,invoice_number,cashier_id,subtotal,tax_amount,total_amount,payment_method,status)
values ('61000000-0000-0000-0000-000000000002','INV-LEGACY-BANK-001','50000000-0000-0000-0000-000000000001',500,0,500,'bank_transfer','pending_payment');
select lives_ok(format('select public.confirm_qris_payment(%L,%L)',(select id from rpc_state where key='bank_legacy_tx'),'50000000-0000-0000-0000-000000000001'),'legacy pending bank transfer confirmation succeeds');
select is((select status::text from public.transactions where id=(select id from rpc_state where key='bank_legacy_tx')),'completed','confirmed bank transfer becomes completed');
select throws_ok(format('select public.confirm_qris_payment(%L,%L)',(select id from rpc_state where key='bank_tx'),'50000000-0000-0000-0000-000000000001'),'P0001','BANK_TRANSFER_ALREADY_CONFIRMED','repeat bank transfer confirmation rejected');
select throws_like(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='bank_tx'),'50000000-0000-0000-0000-000000000001','paid transfer'),'%chk_bank_transfer_void_must_be_unconfirmed%','confirmed bank transfer cannot be voided');

select throws_ok(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='qris_tx'),'50000000-0000-0000-0000-000000000001','paid'),
  'P0001','PAID_TRANSACTION_REQUIRES_RETURN','confirmed QRIS cannot be voided');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000003'),43,'rejected paid QRIS void leaves stock deducted');
select throws_like(format('update public.transactions set status=''voided'',voided_at=now(),voided_by=%L,void_reason=''direct'' where id=%L',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='qris_tx')),'%chk_qris_void_must_be_unconfirmed%','database constraint rejects voided plus confirmed state');
insert into rpc_state values ('qris_source_item',(select id from public.transaction_items where transaction_id=(select id from rpc_state where key='qris_tx')));
select lives_ok(format('select public.create_customer_return(%L,%L,%L,%L,jsonb_build_array(jsonb_build_object(%L,%L,%L,1)))',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='qris_tx'),'qris','paid refund','transaction_item_id',(select id from rpc_state where key='qris_source_item'),'quantity_in_base'),'confirmed QRIS remains returnable');
select is((select count(*)::integer from public.return_items where transaction_item_id=(select id from rpc_state where key='qris_source_item')),1,'QRIS return is recorded');

insert into rpc_state values ('pending_void_tx', '61000000-0000-0000-0000-000000000003');
insert into public.transactions(id,invoice_number,cashier_id,subtotal,tax_amount,total_amount,payment_method,status)
values ('61000000-0000-0000-0000-000000000003','INV-LEGACY-VOID-001','50000000-0000-0000-0000-000000000001',500,0,500,'qris','pending_payment');
insert into public.transaction_items(id,transaction_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity_in_unit,conversion_to_base_snapshot,quantity_in_base,unit_price,discount_amount,tax_rate_snapshot,subtotal,tax_amount,total_amount)
values ('62000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','Product B','tablet',1,1,1,500,0,0,500,0,500);
insert into public.transaction_item_batches(transaction_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot)
values ('62000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003',1,300);
update public.product_batches set quantity = quantity - 1 where id = '40000000-0000-0000-0000-000000000003';
select lives_ok(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='pending_void_tx'),'50000000-0000-0000-0000-000000000001','abandoned'),'legacy pending QRIS can be voided');
select ok((select status='voided' and payment_confirmed_at is null and payment_confirmed_by is null from public.transactions where id=(select id from rpc_state where key='pending_void_tx')),'voided pending QRIS remains unconfirmed');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000003'),44,'pending QRIS void restores stock exactly once');
select throws_ok(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='pending_void_tx'),'50000000-0000-0000-0000-000000000001','again'),'P0001','TRANSACTION_ALREADY_VOIDED','double pending QRIS void rejected');

insert into rpc_state values ('cash_void_tx',(
  public.checkout_transaction('50000000-0000-0000-0000-000000000001','cash',
    '[{"product_unit_id":"30000000-0000-0000-0000-000000000003","quantity":1}]',1000,null)->>'transaction_id')::uuid);
select lives_ok(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='cash_void_tx'),'50000000-0000-0000-0000-000000000001','cash correction'),'cash void remains supported');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000003'),44,'cash void restores stock');

insert into rpc_state values ('source_item',(select id from public.transaction_items where transaction_id=(select id from rpc_state where key='cash_tx')));
select throws_ok(format('select public.create_customer_return(%L,%L,%L,%L,jsonb_build_array(jsonb_build_object(%L,%L,%L,0)))',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='cash_tx'),'qris','zero','transaction_item_id',(select id from rpc_state where key='source_item'),'quantity_in_base'),'P0001','INVALID_RETURN_ITEMS','zero return quantity is rejected');
select throws_ok(format('select public.create_customer_return(%L,%L,%L,%L,jsonb_build_array(jsonb_build_object(%L,%L,%L,1)))',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='pending_void_tx'),'qris','voided','transaction_item_id',(select id from rpc_state where key='source_item'),'quantity_in_base'),'P0001','INVALID_TRANSACTION_STATE','voided sale cannot be returned');
insert into rpc_state values ('return1',(
  public.create_customer_return('50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='cash_tx'),'cash','partial',
    jsonb_build_array(jsonb_build_object('transaction_item_id',(select id from rpc_state where key='source_item'),'quantity_in_base',40)))->>'return_id')::uuid);
select is((select sum(quantity_in_base)::integer from public.return_items where return_id=(select id from rpc_state where key='return1')),40,'partial customer return succeeds');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000001'),30,'partial return restores first original allocation');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000002'),140,'partial return continues into second allocation');
select lives_ok(format('select public.create_customer_return(%L,%L,%L,%L,jsonb_build_array(jsonb_build_object(%L,%L,%L,60)))',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='cash_tx'),'qris','full','transaction_item_id',(select id from rpc_state where key='source_item'),'quantity_in_base'),'full remaining return succeeds');
select is((select coalesce(sum(ri.quantity_in_base),0)::integer from public.return_items ri join public.returns r on r.id=ri.return_id where ri.transaction_item_id=(select id from rpc_state where key='source_item') and r.source='customer'),100,'full cumulative quantity recorded');
select is((select sum(refund_subtotal) from public.return_items where transaction_item_id=(select id from rpc_state where key='source_item')),
  (select subtotal from public.transaction_items where id=(select id from rpc_state where key='source_item')),'partial returns refund the exact original subtotal');
select is((select sum(refund_tax_amount) from public.return_items where transaction_item_id=(select id from rpc_state where key='source_item')),
  (select tax_amount from public.transaction_items where id=(select id from rpc_state where key='source_item')),'partial returns refund the exact original tax');
select throws_ok(format('select public.create_customer_return(%L,%L,%L,%L,jsonb_build_array(jsonb_build_object(%L,%L,%L,1)))',
  '50000000-0000-0000-0000-000000000001',(select id from rpc_state where key='cash_tx'),'qris','too much','transaction_item_id',(select id from rpc_state where key='source_item'),'quantity_in_base'),'P0001','RETURN_QUANTITY_EXCEEDED','cumulative return limit enforced');
select throws_ok(format('select public.void_transaction(%L,%L,%L)',(select id from rpc_state where key='cash_tx'),'50000000-0000-0000-0000-000000000001','invalid'),'P0001','TRANSACTION_HAS_RETURNS','returned transaction cannot be voided');

select lives_ok($$select public.create_supplier_return('50000000-0000-0000-0000-000000000002','supplier',
  '[{"product_id":"20000000-0000-0000-0000-000000000001","batch_id":"40000000-0000-0000-0000-000000000002","quantity_in_base":10}]')$$,'supplier return succeeds');
select is((select quantity from public.product_batches where id='40000000-0000-0000-0000-000000000002'),190,'supplier return reduces stock');
select throws_ok($$select public.create_supplier_return('50000000-0000-0000-0000-000000000002','too much',
  '[{"product_id":"20000000-0000-0000-0000-000000000001","batch_id":"40000000-0000-0000-0000-000000000002","quantity_in_base":999}]')$$,'P0001','INSUFFICIENT_STOCK','supplier insufficient stock rejected');

insert into rpc_state values ('opname1',(public.start_stock_opname('50000000-0000-0000-0000-000000000002',null)->>'session_id')::uuid);
select is((select status from public.stock_opname_sessions where id=(select id from rpc_state where key='opname1')),'in_progress','stock opname starts');
select throws_ok($$select public.start_stock_opname('50000000-0000-0000-0000-000000000002',null)$$,'P0001','STOCK_OPNAME_IN_PROGRESS','second active opname rejected');
select throws_ok($$select public.create_supplier_return('50000000-0000-0000-0000-000000000002','frozen',
  '[{"product_id":"20000000-0000-0000-0000-000000000001","batch_id":"40000000-0000-0000-0000-000000000002","quantity_in_base":1}]')$$,'P0001','STOCK_OPNAME_IN_PROGRESS','inventory mutation blocked while frozen');
select throws_ok($$select public.checkout_transaction('50000000-0000-0000-0000-000000000001','cash',
  '[{"product_unit_id":"30000000-0000-0000-0000-000000000003","quantity":1}]',1000,null)$$,'P0001','STOCK_OPNAME_IN_PROGRESS','checkout blocked while inventory is frozen');
update public.stock_opname_items set physical_quantity=system_quantity+1 where session_id=(select id from rpc_state where key='opname1');
select lives_ok(format('select public.apply_stock_opname(%L,%L)',(select id from rpc_state where key='opname1'),'50000000-0000-0000-0000-000000000002'),'stock opname applies');
select is((select status from public.stock_opname_sessions where id=(select id from rpc_state where key='opname1')),'applied','apply lifecycle finalized');
insert into rpc_state values ('opname2',(public.start_stock_opname('50000000-0000-0000-0000-000000000002',null)->>'session_id')::uuid);
select lives_ok(format('select public.cancel_stock_opname(%L,%L)',(select id from rpc_state where key='opname2'),'50000000-0000-0000-0000-000000000002'),'stock opname cancels');
select is((select status from public.stock_opname_sessions where id=(select id from rpc_state where key='opname2')),'cancelled','cancel lifecycle finalized');

select ok(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('checkout_transaction','confirm_qris_payment','void_transaction','create_customer_return','create_supplier_return','start_stock_opname','apply_stock_opname','cancel_stock_opname')
  and has_function_privilege('anon',oid,'EXECUTE')),'anon cannot execute critical RPCs');
select ok(not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in
  ('checkout_transaction','confirm_qris_payment','void_transaction','create_customer_return','create_supplier_return','start_stock_opname','apply_stock_opname','cancel_stock_opname')
  and has_function_privilege('authenticated',oid,'EXECUTE')),'authenticated cannot execute critical RPCs');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname in
  ('checkout_transaction','confirm_qris_payment','void_transaction','create_customer_return','create_supplier_return','start_stock_opname','apply_stock_opname','cancel_stock_opname')
  and has_function_privilege('service_role',oid,'EXECUTE')),8,'service role can execute all critical RPCs');

select * from finish();
rollback;
