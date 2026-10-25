begin;
select plan(11);

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

select is(public.sales_gross_profit_report('2090-01-01','2090-01-01')->>'salesRevenue','200.00','cash revenue is not duplicated across batches');
select is(public.sales_gross_profit_report('2090-01-01','2090-01-01')->>'cogs','120.00','sale uses both batch cost snapshots');
select is(public.sales_gross_profit_report('2090-01-01','2090-01-01')->>'completedTransactionCount','1','pending and later-confirmed transactions excluded');
select is(public.sales_gross_profit_report('2090-01-02','2090-01-02')->>'salesRevenue','100.00','QRIS recognized on Jakarta confirmation date');
select is(public.sales_gross_profit_report('2090-01-02','2090-01-02')->>'refunds','100.00','refund recognized on return date');
select is(public.sales_gross_profit_report('2090-01-02','2090-01-02')->>'returnedCogs','50.00','return cost uses original allocation snapshot');
select is(public.sales_gross_profit_report('2090-01-02','2090-01-02')->>'grossProfit','50.00','profit excludes tax and reverses returned cost');
select is(public.sales_gross_profit_report('2090-01-02','2090-01-02')->>'grossMarginPercent',null,'zero net revenue has no margin');
select is(public.sales_gross_profit_report('2090-01-01','2090-01-02')->>'salesTax','30.00','sales tax is reported separately');
select is(public.sales_gross_profit_report('2090-01-01','2090-01-02')->>'refundedTax','10.00','refunded tax is reported separately');
select ok(not has_function_privilege('authenticated','public.sales_gross_profit_report(date,date)','execute') and not has_function_privilege('anon','public.sales_gross_profit_report(date,date)','execute'),'browser roles cannot execute financial report');
select * from finish();
rollback;
