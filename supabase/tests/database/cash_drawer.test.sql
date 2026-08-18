begin;
select plan(13);
insert into public.employees(id,full_name,position) values
 ('71000000-0000-0000-0000-000000000001','Drawer Cashier','kasir'),
 ('71000000-0000-0000-0000-000000000002','Other Cashier','kasir');

select lives_ok($$select public.open_cash_drawer('71000000-0000-0000-0000-000000000001',1000)$$,'valid drawer opens');
select is((select count(*)::integer from public.cash_drawer_sessions where employee_id='71000000-0000-0000-0000-000000000001' and is_open),1,'current drawer lookup finds one open session');
select is((select opening_balance from public.cash_drawer_sessions where employee_id='71000000-0000-0000-0000-000000000001'),1000::numeric,'opening balance persisted');
select throws_ok($$select public.open_cash_drawer('71000000-0000-0000-0000-000000000001',50)$$,'P0001','CASH_DRAWER_ALREADY_OPEN','duplicate open rejected');
select throws_ok($$select public.open_cash_drawer('71000000-0000-0000-0000-000000000002',-1)$$,'P0001','INVALID_OPENING_BALANCE','negative opening balance rejected');

select public.open_cash_drawer('71000000-0000-0000-0000-000000000002',500);
create temporary table drawer_state as select
 (select id from public.cash_drawer_sessions where employee_id='71000000-0000-0000-0000-000000000001') main_drawer,
 (select id from public.cash_drawer_sessions where employee_id='71000000-0000-0000-0000-000000000002') other_drawer;
insert into public.transactions(id,invoice_number,cashier_id,cash_drawer_session_id,subtotal,total_amount,payment_method,cash_received,cash_change,payment_confirmed_at,payment_confirmed_by,status,voided_at,voided_by,void_reason)
values
 ('72000000-0000-0000-0000-000000000001','DRAWER-CASH','71000000-0000-0000-0000-000000000001',(select main_drawer from drawer_state),100,100,'cash',100,0,now(),'71000000-0000-0000-0000-000000000001','completed',null,null,null),
 ('72000000-0000-0000-0000-000000000002','DRAWER-QRIS','71000000-0000-0000-0000-000000000001',(select main_drawer from drawer_state),200,200,'qris',null,null,null,null,'pending_payment',null,null,null),
 ('72000000-0000-0000-0000-000000000003','DRAWER-VOID','71000000-0000-0000-0000-000000000001',(select main_drawer from drawer_state),300,300,'cash',300,0,now(),'71000000-0000-0000-0000-000000000001','voided',now(),'71000000-0000-0000-0000-000000000001','voided');
insert into public.returns(source,transaction_id,refund_method,cash_drawer_session_id,reason,processed_by,refund_subtotal,refund_total)
values
 ('customer','72000000-0000-0000-0000-000000000001','cash',(select main_drawer from drawer_state),'main refund','71000000-0000-0000-0000-000000000001',20,20),
 ('customer','72000000-0000-0000-0000-000000000001','cash',(select other_drawer from drawer_state),'other refund','71000000-0000-0000-0000-000000000002',30,30);

select lives_ok(format('select public.close_cash_drawer(%L,%L,1080)',(select main_drawer from drawer_state),'71000000-0000-0000-0000-000000000001'),'valid drawer close succeeds');
select is((select sum(total_amount) from public.transactions where cash_drawer_session_id=(select main_drawer from drawer_state) and payment_method='cash' and status='completed'),100::numeric,'only completed cash sales qualify');
select is((select sum(refund_total) from public.returns where cash_drawer_session_id=(select main_drawer from drawer_state) and refund_method='cash'),20::numeric,'only refunds paid by this drawer qualify');
select is((select closing_balance_expected from public.cash_drawer_sessions where id=(select main_drawer from drawer_state)),1080::numeric,'expected cash calculated authoritatively');
select is((select variance from public.cash_drawer_sessions where id=(select main_drawer from drawer_state)),0::numeric,'closing difference calculated');
select ok((select not is_open and closed_at is not null from public.cash_drawer_sessions where id=(select main_drawer from drawer_state)),'drawer lifecycle is closed');
select throws_ok(format('select public.close_cash_drawer(%L,%L,1080)',(select main_drawer from drawer_state),'71000000-0000-0000-0000-000000000001'),'P0001','CASH_DRAWER_ALREADY_CLOSED','repeated close rejected');
select throws_ok(format('select public.checkout_transaction(%L,%L,''cash'',''[]''::jsonb,100,null)','71000000-0000-0000-0000-000000000001',(select main_drawer from drawer_state)),'P0001','NO_ACTIVE_CASH_DRAWER','closed drawer cannot be reused for checkout');
select * from finish();
rollback;
