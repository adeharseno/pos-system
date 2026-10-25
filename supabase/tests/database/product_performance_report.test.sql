begin;
select plan(11);

insert into public.categories(id,name) values ('fc000000-0000-0000-0000-000000000001','Performance test category');
insert into public.subcategories(id,category_id,name) values ('fc000000-0000-0000-0000-000000000002','fc000000-0000-0000-0000-000000000001','Performance test subcategory');
insert into public.products(id,sku,name,category_id,subcategory_id,base_unit) values
 ('fc000000-0000-0000-0000-000000000003','PERF-SOLD','Performance sold','fc000000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000002','tablet'),
 ('fc000000-0000-0000-0000-000000000004','PERF-STOCK','Performance stock','fc000000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000002','tablet'),
 ('fc000000-0000-0000-0000-000000000005','PERF-EMPTY','Performance empty','fc000000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000002','tablet');
insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
 ('fc000000-0000-0000-0000-000000000006','fc000000-0000-0000-0000-000000000003','tablet',1,10,true),
 ('fc000000-0000-0000-0000-000000000007','fc000000-0000-0000-0000-000000000003','strip',10,100,false);
insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price) values
 ('fc000000-0000-0000-0000-000000000004','active','9999-01-01',7,1),
 ('fc000000-0000-0000-0000-000000000005','expired','2000-01-01',9,1);
insert into public.employees(id,full_name,position) values ('fc000000-0000-0000-0000-000000000008','Performance cashier','kasir');
insert into public.cash_drawer_sessions(id,employee_id,opening_balance) values ('fc000000-0000-0000-0000-000000000009','fc000000-0000-0000-0000-000000000008',0);
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,payment_confirmed_at,payment_confirmed_by,status) values
 ('fc000000-0000-0000-0000-000000000010','PERF-CASH','2091-01-01','fc000000-0000-0000-0000-000000000008','fc000000-0000-0000-0000-000000000009',120,0,120,'cash',120,0,'2091-01-01 01:00+07','fc000000-0000-0000-0000-000000000008','completed');
insert into public.transaction_items(id,transaction_id,product_id,product_unit_id,product_name_snapshot,unit_name_snapshot,quantity_in_unit,conversion_to_base_snapshot,quantity_in_base,unit_price,tax_rate_snapshot,subtotal,tax_amount,total_amount) values
 ('fc000000-0000-0000-0000-000000000011','fc000000-0000-0000-0000-000000000010','fc000000-0000-0000-0000-000000000003','fc000000-0000-0000-0000-000000000006','Performance sold','tablet',2,1,2,10,0,20,0,20),
 ('fc000000-0000-0000-0000-000000000012','fc000000-0000-0000-0000-000000000010','fc000000-0000-0000-0000-000000000003','fc000000-0000-0000-0000-000000000007','Performance sold','strip',1,10,10,100,0,100,0,100);
insert into public.returns(id,source,transaction_id,refund_method,business_date,reason,processed_by,refund_subtotal,refund_tax_amount,refund_total) values
 ('fc000000-0000-0000-0000-000000000013','customer','fc000000-0000-0000-0000-000000000010','qris','2091-01-02','test','fc000000-0000-0000-0000-000000000008',50,0,50);
insert into public.return_items(return_id,product_id,transaction_item_id,quantity_in_base,refund_subtotal,refund_tax_amount,refund_total) values
 ('fc000000-0000-0000-0000-000000000013','fc000000-0000-0000-0000-000000000003','fc000000-0000-0000-0000-000000000012',5,50,0,50);

select is((select x->>'quantitySold' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-01')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'12','multiple units count base quantity');
select is((select x->>'returnedQuantity' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-02')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'5','partial return counted');
select is((select x->>'netQuantity' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-02')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'7','net base quantity');
select is((select x->>'netRevenue' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-02','revenue')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'70.00','net revenue after return');
select is((select x->>'netQuantity' from jsonb_array_elements(public.product_performance_report('2091-01-02','2091-01-02')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'-5','return recognized on its own date');
select is((select x->>'netRevenue' from jsonb_array_elements(public.product_performance_report('2091-01-02','2091-01-02')->'bestSelling') x where x->>'sku'='PERF-SOLD'),'-50.00','refund revenue recognized on return date');
select is((select x->>'availableStock' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-01')->'unsold') x where x->>'sku'='PERF-STOCK'),'7','unsold stock available');
select is((select x->>'availableStock' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-01')->'unsold') x where x->>'sku'='PERF-EMPTY'),'0','expired stock excluded');
select is((select x->>'hasStock' from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-01')->'unsold') x where x->>'sku'='PERF-EMPTY'),'false','stock absence explicit');
select ok(not exists(select 1 from jsonb_array_elements(public.product_performance_report('2091-01-01','2091-01-01')->'unsold') x where x->>'sku'='PERF-SOLD'),'sold product not unsold');
select ok(not has_function_privilege('authenticated','public.product_performance_report(date,date,text)','execute') and not has_function_privilege('anon','public.product_performance_report(date,date,text)','execute'),'browser roles cannot execute report');
select * from finish();
rollback;
