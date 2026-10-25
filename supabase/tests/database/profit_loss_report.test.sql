begin;
select plan(13);
insert into public.categories(id,name) values ('fe000000-0000-0000-0000-000000000001','Profit test category');
insert into public.subcategories(id,category_id,name) values ('fe000000-0000-0000-0000-000000000002','fe000000-0000-0000-0000-000000000001','Profit test subcategory');
insert into public.products(id,sku,name,category_id,subcategory_id,base_unit) values ('fe000000-0000-0000-0000-000000000003','PROFIT-TEST-SKU','Profit product','fe000000-0000-0000-0000-000000000001','fe000000-0000-0000-0000-000000000002','tablet');
insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values ('fe000000-0000-0000-0000-000000000004','fe000000-0000-0000-0000-000000000003','tablet',1,100,true);
insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values ('fe000000-0000-0000-0000-000000000005','fe000000-0000-0000-0000-000000000003','profit','2099-01-01',1,40);
insert into public.employees(id,full_name,position) values ('fe000000-0000-0000-0000-000000000006','Profit cashier','kasir');
insert into public.cash_drawer_sessions(id,employee_id,opening_balance) values ('fe000000-0000-0000-0000-000000000007','fe000000-0000-0000-0000-000000000006',0);
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,payment_confirmed_at,payment_confirmed_by,status) values
 ('fe000000-0000-0000-0000-000000000008','PROFIT-CASH','2093-01-01','fe000000-0000-0000-0000-000000000006','fe000000-0000-0000-0000-000000000007',200,20,220,'cash',220,0,'2093-01-01 01:00+07','fe000000-0000-0000-0000-000000000006','completed');
insert into public.transaction_items(id,transaction_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity_in_unit,conversion_to_base_snapshot,quantity_in_base,unit_price,tax_rate_snapshot,subtotal,tax_amount,total_amount) values
 ('fe000000-0000-0000-0000-000000000009','fe000000-0000-0000-0000-000000000008','fe000000-0000-0000-0000-000000000003','fe000000-0000-0000-0000-000000000004','Profit product','tablet',2,1,2,100,10,200,20,220);
insert into public.transaction_item_batches(transaction_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot) values
 ('fe000000-0000-0000-0000-000000000009','fe000000-0000-0000-0000-000000000003','fe000000-0000-0000-0000-000000000005',2,40);
insert into public.returns(id,source,transaction_id,refund_method,business_date,reason,processed_by,refund_subtotal,refund_tax_amount,refund_total) values
 ('fe000000-0000-0000-0000-000000000010','customer','fe000000-0000-0000-0000-000000000008','qris','2093-01-02','test','fe000000-0000-0000-0000-000000000006',100,10,110);
insert into public.return_items(id,return_id,product_id,transaction_item_id,quantity_in_base,refund_subtotal,refund_tax_amount,refund_total) values
 ('fe000000-0000-0000-0000-000000000011','fe000000-0000-0000-0000-000000000010','fe000000-0000-0000-0000-000000000003','fe000000-0000-0000-0000-000000000009',1,100,10,110);
insert into public.return_item_batches(return_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot) values
 ('fe000000-0000-0000-0000-000000000011','fe000000-0000-0000-0000-000000000003','fe000000-0000-0000-0000-000000000005',1,40);
insert into public.operational_expenses(expense_date,category,amount,created_by)
select '2093-01-01','test',1.01,'fe000000-0000-0000-0000-000000000006' from generate_series(1,25);
insert into public.operational_expenses(expense_date,category,amount,created_by) values ('2093-01-02','test',75.25,'fe000000-0000-0000-0000-000000000006');

select is(public.profit_loss_report('2093-01-01','2093-01-01')->>'salesRevenue','200.00','sales before tax');
select is(public.profit_loss_report('2093-01-01','2093-01-01')->>'netCogs','80.00','original batch costs');
select is(public.profit_loss_report('2093-01-01','2093-01-01')->>'grossProfit','120.00','gross profit excludes tax');
select is(public.profit_loss_report('2093-01-01','2093-01-01')->>'operatingExpenses','25.25','all expenses beyond one UI page summed exactly');
select is(public.profit_loss_report('2093-01-01','2093-01-01')->>'estimatedProfitAfterRecordedExpenses','94.75','estimated profit after expenses');
select is(public.profit_loss_report('2093-01-02','2093-01-02')->>'refunds','100.00','return recognized in later period');
select is(public.profit_loss_report('2093-01-02','2093-01-02')->>'netCogs','-40.00','returned cost reversed');
select is(public.profit_loss_report('2093-01-02','2093-01-02')->>'netRevenue','-100.00','negative net revenue on return date');
select is(public.profit_loss_report('2093-01-02','2093-01-02')->>'estimatedProfitAfterRecordedExpenses','-135.25','negative result retained');
select is(public.profit_loss_report('2093-01-03','2093-01-03')->>'grossMarginPercent',null,'zero sales margin is null');
select is(public.profit_loss_report('2093-01-03','2093-01-03')->>'estimatedProfitAfterRecordedExpenses','0.00','empty period is zero');
select is(public.profit_loss_report('2093-01-01','2093-01-02')->>'grossProfit',public.sales_gross_profit_report('2093-01-01','2093-01-02')->>'grossProfit','gross profit matches existing report');
select ok(not has_function_privilege('authenticated','public.profit_loss_report(date,date)','execute') and not has_function_privilege('anon','public.profit_loss_report(date,date)','execute'),'financial report unavailable to browser roles');
select * from finish();
rollback;
