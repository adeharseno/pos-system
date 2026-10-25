begin;
select plan(12);

insert into public.employees(id,full_name,position) values ('fd000000-0000-0000-0000-000000000001','Payment report cashier','kasir');
insert into public.cash_drawer_sessions(id,employee_id,opening_balance) values ('fd000000-0000-0000-0000-000000000002','fd000000-0000-0000-0000-000000000001',0);
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,payment_confirmed_at,payment_confirmed_by,status) values
 ('fd000000-0000-0000-0000-000000000003','PAYREPORT-CASH','2092-01-01','fd000000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000002',100,10,110,'cash',200,90,'2092-01-01 01:00+07','fd000000-0000-0000-0000-000000000001','completed'),
 ('fd000000-0000-0000-0000-000000000004','PAYREPORT-QRIS','2092-01-01','fd000000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000002',200,20,220,'qris',null,null,'2092-01-01 18:00+00','fd000000-0000-0000-0000-000000000001','completed'),
 ('fd000000-0000-0000-0000-000000000005','PAYREPORT-BANK','2092-01-01','fd000000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000002',300,30,330,'bank_transfer',null,null,'2092-01-01 18:00+00','fd000000-0000-0000-0000-000000000001','completed'),
 ('fd000000-0000-0000-0000-000000000006','PAYREPORT-PENDING','2092-01-01','fd000000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000002',400,40,440,'qris',null,null,null,null,'pending_payment');
insert into public.transactions(id,invoice_number,business_date,cashier_id,cash_drawer_session_id,subtotal,tax_amount,total_amount,payment_method,status,voided_at,voided_by,void_reason) values
 ('fd000000-0000-0000-0000-000000000007','PAYREPORT-VOID','2092-01-01','fd000000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000002',500,50,550,'qris','voided','2092-01-01 01:00+07','fd000000-0000-0000-0000-000000000001','test');
insert into public.returns(id,source,transaction_id,refund_method,business_date,reason,processed_by,refund_subtotal,refund_tax_amount,refund_total) values
 ('fd000000-0000-0000-0000-000000000008','customer','fd000000-0000-0000-0000-000000000003','qris','2092-01-02','test','fd000000-0000-0000-0000-000000000001',20,2,22),
 ('fd000000-0000-0000-0000-000000000009','supplier',null,null,'2092-01-02','test','fd000000-0000-0000-0000-000000000001',99,0,99);

select is((select x->>'paymentsReceived' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='cash'),'110.00','cash uses amount due not cash tendered');
select is((select x->>'completedCount' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='qris'),'0','QRIS not counted before Jakarta confirmation day');
select is((select x->>'paymentsReceived' from jsonb_array_elements(public.payment_refund_report('2092-01-02','2092-01-02')->'methods') x where x->>'method'='qris'),'220.00','QRIS confirmed on Jakarta day');
select is((select x->>'paymentsReceived' from jsonb_array_elements(public.payment_refund_report('2092-01-02','2092-01-02')->'methods') x where x->>'method'='bank_transfer'),'330.00','bank transfer distinct and confirmed');
select is((select x->>'pendingCount' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='qris'),'1','only pending payment counted');
select is((select x->>'pendingAmount' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='qris'),'440.00','pending amount excludes voided');
select is((select x->>'customerRefunds' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='qris'),'0.00','refund not counted before return date');
select is((select x->>'customerRefunds' from jsonb_array_elements(public.payment_refund_report('2092-01-02','2092-01-02')->'methods') x where x->>'method'='qris'),'22.00','refund uses actual refund method and excludes supplier');
select is((select x->>'customerRefunds' from jsonb_array_elements(public.payment_refund_report('2092-01-02','2092-01-02')->'methods') x where x->>'method'='cash'),'0.00','refund not attributed to original payment method');
select is((select x->>'netPayments' from jsonb_array_elements(public.payment_refund_report('2092-01-02','2092-01-02')->'methods') x where x->>'method'='qris'),'198.00','net payments subtract refunds including tax');
select is((select x->>'completedCount' from jsonb_array_elements(public.payment_refund_report('2092-01-01','2092-01-01')->'methods') x where x->>'method'='cash'),'1','completed cash count');
select ok(not has_function_privilege('authenticated','public.payment_refund_report(date,date)','execute') and not has_function_privilege('anon','public.payment_refund_report(date,date)','execute'),'browser roles cannot execute report');
select * from finish();
rollback;
