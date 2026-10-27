begin;
select plan(21);

insert into public.categories(id,name) values ('fb000000-0000-0000-0000-000000000001','Report test category');
insert into public.subcategories(id,category_id,name) values ('fb000000-0000-0000-0000-000000000002','fb000000-0000-0000-0000-000000000001','Report test subcategory');
insert into public.products(id,sku,name,category_id,subcategory_id,base_unit) values ('fb000000-0000-0000-0000-000000000003','REPORT-TEST-SKU','Report product','fb000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000002','tablet');
insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values ('fb000000-0000-0000-0000-000000000004','fb000000-0000-0000-0000-000000000003','tablet',1,100,true);
insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values
 ('fb000000-0000-0000-0000-000000000005','fb000000-0000-0000-0000-000000000003','report1','2099-01-01',1,50),
 ('fb000000-0000-0000-0000-000000000006','fb000000-0000-0000-0000-000000000003','report2','2099-01-01',1,70);
insert into public.employees(id,full_name,position) values ('fb000000-0000-0000-0000-000000000007','Report cashier','kasir');
insert into public.cash_drawer_sessions(id,employee_id,opening_balance) values ('fb000000-0000-0000-0000-000000000008','fb000000-0000-0000-0000-000000000007',0);
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,payment_confirmed_at,payment_confirmed_by,status) values
 ('fb000000-0000-0000-0000-000000000009','REPORT-TEST-CASH','2090-01-01','fb000000-0000-0000-0000-000000000007','fb000000-0000-0000-0000-000000000008',200,20,220,'cash',220,0,'2090-01-01 01:00+07','fb000000-0000-0000-0000-000000000007','completed'),
 ('fb000000-0000-0000-0000-000000000010','REPORT-TEST-QRIS','2090-01-01','fb000000-0000-0000-0000-000000000007','fb000000-0000-0000-0000-000000000008',100,10,110,'qris',null,null,'2090-01-01 18:00+00','fb000000-0000-0000-0000-000000000007','completed'),
 ('fb000000-0000-0000-0000-000000000011','REPORT-TEST-PENDING','2090-01-01','fb000000-0000-0000-0000-000000000007','fb000000-0000-0000-0000-000000000008',500,50,550,'qris',null,null,null,null,'pending_payment');
insert into public.transaction_items(id,transaction_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity_in_unit,conversion_to_base_snapshot,quantity_in_base,unit_price,tax_rate_snapshot,subtotal,tax_amount,total_amount) values
 ('fb000000-0000-0000-0000-000000000012','fb000000-0000-0000-0000-000000000009','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000004','Report product','tablet',2,1,2,100,10,200,20,220);
insert into public.transaction_item_batches(transaction_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot) values
 ('fb000000-0000-0000-0000-000000000012','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000005',1,50),
 ('fb000000-0000-0000-0000-000000000012','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000006',1,70);
insert into public.returns(id,source,transaction_id,refund_method,business_date,reason,processed_by,refund_subtotal,refund_tax_amount,refund_total) values
 ('fb000000-0000-0000-0000-000000000013','customer','fb000000-0000-0000-0000-000000000009','qris','2090-01-02','test','fb000000-0000-0000-0000-000000000007',100,10,110);
insert into public.return_items(id,return_id,product_id,transaction_item_id,quantity_in_base,refund_subtotal,refund_tax_amount,refund_total) values
 ('fb000000-0000-0000-0000-000000000014','fb000000-0000-0000-0000-000000000013','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000012',1,100,10,110);
insert into public.return_item_batches(return_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot) values
 ('fb000000-0000-0000-0000-000000000014','fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000005',1,50);


select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'summary',public.sales_gross_profit_report('2090-01-01','2090-01-02'),'dashboard summary exactly equals reports including return costs and tax');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'payments',public.payment_refund_report('2090-01-01','2090-01-02')->'methods','dashboard payment values exactly equal reports');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'products',public.product_performance_report('2090-01-01','2090-01-02','quantity')->'bestSelling','ranking uses authoritative product report');
select is(jsonb_array_length(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'monthly'),12,'year has 12 aggregate months');
select is(jsonb_array_length(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'daily'),2,'range has inclusive daily points');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)#>>'{daily,0,revenue}','200.00','cash recognized on business date, pending excluded');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)#>>'{daily,1,revenue}','100.00','QRIS recognized on Jakarta confirmation date, before return subtraction');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)#>>'{monthly,0,revenue}','300.00','monthly aggregates completed sales once without allocation duplication');
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2089)#>>'{monthly,0,revenue}','0.00','monthly year is independent of selected period');
select is(public.dashboard_analytics_report('2089-01-01','2089-01-01',2089)#>>'{summary,salesRevenue}','0.00','empty period reports actual zero');
select is(public.dashboard_analytics_report('2089-01-01','2089-01-01',2089)#>>'{summary,grossMarginPercent}',null,'empty margin is not applicable');
select ok(not has_function_privilege('anon','public.dashboard_analytics_report(date,date,integer)','execute') and not has_function_privilege('authenticated','public.dashboard_analytics_report(date,date,integer)','execute'),'browser roles cannot call dashboard financial RPC');
select ok(has_function_privilege('service_role','public.dashboard_analytics_report(date,date,integer)','execute'),'trusted server can execute');
select throws_ok($$select public.dashboard_analytics_report('2090-01-02','2090-01-01',2090)$$,'22023','INVALID_DASHBOARD_PERIOD','reversed date range rejected');
select throws_ok($$select public.dashboard_analytics_report('2088-01-01','2090-01-01',2090)$$,'22023','INVALID_DASHBOARD_PERIOD','unbounded series rejected');
select throws_ok($$select public.dashboard_analytics_report('2090-01-01','2090-01-01',0)$$,'22023','INVALID_DASHBOARD_PERIOD','invalid year rejected');
select ok((select provolatile = 's' and not prosecdef from pg_proc where oid = 'public.dashboard_analytics_report(date,date,integer)'::regprocedure),'RPC is stable and security invoker');
select is((select sum((value->>'revenue')::numeric) from jsonb_array_elements(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)->'daily')), (public.sales_gross_profit_report('2090-01-01','2090-01-02')->>'salesRevenue')::numeric,'sum of daily chart equals total sales in reports');

-- Rollback-only fixtures: verify bank confirmation boundaries and void exclusion.
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,payment_confirmed_at,payment_confirmed_by,status) values
 ('fb000000-0000-0000-0000-000000000020','DASHBOARD-BANK','2090-01-01','fb000000-0000-0000-0000-000000000007','fb000000-0000-0000-0000-000000000008',100,10,110,'bank_transfer','2090-02-01 18:00+00','fb000000-0000-0000-0000-000000000007','completed');
select is(public.dashboard_analytics_report('2090-02-02','2090-02-02',2090)#>>'{daily,0,revenue}','100.00','bank transfer is recognized on Jakarta confirmation day across month boundary');
select is(public.dashboard_analytics_report('2090-02-02','2090-02-02',2090)#>>'{monthly,1,revenue}','100.00','bank transfer belongs to confirmation month rather than business month');
update public.transactions set status='voided',voided_at='2090-02-03 01:00+07',voided_by='fb000000-0000-0000-0000-000000000007',void_reason='rollback-only test' where id='fb000000-0000-0000-0000-000000000011';
select is(public.dashboard_analytics_report('2090-01-01','2090-01-02',2090)#>>'{monthly,0,revenue}','300.00','voided transactions excluded from chart aggregates');

select * from finish();
rollback;
