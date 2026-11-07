begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(15);

insert into employees(id,full_name,position) values('e4900000-0000-4000-8000-000000000001','Terms Owner','owner_admin');
insert into suppliers(id,name) values('e4900000-0000-4000-8000-000000000002','Terms Supplier');

select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000010','e4900000-0000-4000-8000-000000000011','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','CASH','invoice_date',current_date,'total_amount','1000.00','payment_method','cash','due_days',null));
select is((select sum(amount) from purchase_invoice_payments where invoice_id='e4900000-0000-4000-8000-000000000010'),1000::numeric,'cash invoice paid fully');
select is((select payment_method from purchase_invoices where id='e4900000-0000-4000-8000-000000000010'),'cash','cash method stored');
select is((select due_date from purchase_invoices where id='e4900000-0000-4000-8000-000000000010'),null::date,'cash has no due date');
select is((select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000010','e4900000-0000-4000-8000-000000000011','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','CASH','invoice_date',current_date,'total_amount','1000.00','payment_method','cash','due_days',null))->>'replayed'),'true','cash retry replays');
select is((select count(*) from purchase_invoice_payments where invoice_id='e4900000-0000-4000-8000-000000000010'),1::bigint,'cash retry does not duplicate payment');

select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000020','e4900000-0000-4000-8000-000000000021','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','TERMS-7','invoice_date',current_date,'total_amount','900.00','payment_method','terms','due_days',7));
select is((select due_date from purchase_invoices where id='e4900000-0000-4000-8000-000000000020'),current_date+7,'tempo due date calculated');
select is((select count(*) from purchase_invoice_payments where invoice_id='e4900000-0000-4000-8000-000000000020'),0::bigint,'tempo starts unpaid');
select is((select status from purchase_invoices where id='e4900000-0000-4000-8000-000000000020'),'draft','payment status does not change receiving status');

select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000030','e4900000-0000-4000-8000-000000000031','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','DUE-TODAY','invoice_date',current_date-5,'total_amount','500.00','payment_method','terms','due_days',5));
select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000040','e4900000-0000-4000-8000-000000000041','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','OVERDUE','invoice_date',current_date-10,'total_amount','400.00','payment_method','terms','due_days',5));
select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000050','e4900000-0000-4000-8000-000000000051','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','FUTURE','invoice_date',current_date,'total_amount','300.00','payment_method','terms','due_days',8));
select is(jsonb_array_length(purchase_invoice_due_reminders(current_date)),3,'reminders include seven days, today, and overdue but not day eight');
select is((select (entry->>'daysRemaining')::int from jsonb_array_elements(purchase_invoice_due_reminders(current_date)) entry where entry->>'invoiceNumber'='DUE-TODAY'),0,'due today labeled with zero days');
select is((select (entry->>'daysRemaining')::int from jsonb_array_elements(purchase_invoice_due_reminders(current_date)) entry where entry->>'invoiceNumber'='OVERDUE'),-5,'overdue days retained');

select record_purchase_invoice_payment('e4900000-0000-4000-8000-000000000020','e4900000-0000-4000-8000-000000000060','e4900000-0000-4000-8000-000000000001',400,current_date);
select is((select (entry->>'outstanding')::numeric from jsonb_array_elements(purchase_invoice_due_reminders(current_date)) entry where entry->>'invoiceNumber'='TERMS-7'),500::numeric,'partial settlement updates outstanding');
select record_purchase_invoice_payment('e4900000-0000-4000-8000-000000000020','e4900000-0000-4000-8000-000000000061','e4900000-0000-4000-8000-000000000001',500,current_date);
select is((select count(*) from jsonb_array_elements(purchase_invoice_due_reminders(current_date)) entry where entry->>'invoiceNumber'='TERMS-7'),0::bigint,'paid invoice disappears from reminders');
select throws_ok($$select save_purchase_invoice_draft_v2('e4900000-0000-4000-8000-000000000070','e4900000-0000-4000-8000-000000000071','e4900000-0000-4000-8000-000000000001',null,
  jsonb_build_object('supplier_id','e4900000-0000-4000-8000-000000000002','invoice_number','BAD','invoice_date',current_date,'total_amount','1.00','payment_method','terms','due_days',0))$$,'P0001','INVALID_PURCHASE_INVOICE','due days must be positive');
select is((select count(*) from purchase_invoices where id='e4900000-0000-4000-8000-000000000070'),0::bigint,'invalid tempo leaves no invoice');

select * from finish();
rollback;
