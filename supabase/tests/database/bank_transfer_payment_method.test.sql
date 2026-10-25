begin;
select plan(6);

insert into public.employees(id, full_name, position)
values ('da000000-0000-0000-0000-000000000001', 'Test cashier', 'kasir');
insert into public.cash_drawer_sessions(id, employee_id, opening_balance)
values ('da000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000001', 0);

select lives_ok($$
  insert into public.transactions(id, invoice_number, cashier_id, cash_drawer_session_id,
    subtotal, tax_amount, total_amount, payment_method, status)
  values ('da000000-0000-0000-0000-000000000003', 'TEST-BANK-TRANSFER',
    'da000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000002',
    100, 0, 100, 'bank_transfer', 'pending_payment')
$$, 'bank transfer can be stored as pending without cash or confirmation');
select is((select payment_method::text from public.transactions where id = 'da000000-0000-0000-0000-000000000003'),
  'bank_transfer', 'bank transfer remains distinct from QRIS');
select throws_like($$
  update public.transactions set status = 'completed' where id = 'da000000-0000-0000-0000-000000000003'
$$, '%chk_transaction_payment_shape%', 'transfer cannot complete without confirmation');
select throws_like($$
  update public.transactions set cash_received = 100 where id = 'da000000-0000-0000-0000-000000000003'
$$, '%chk_transaction_payment_shape%', 'transfer cannot have cash received');
select lives_ok($$
  update public.transactions set status = 'completed', payment_confirmed_at = now(),
    payment_confirmed_by = 'da000000-0000-0000-0000-000000000001'
  where id = 'da000000-0000-0000-0000-000000000003'
$$, 'confirmed bank transfer can be stored as completed');
select throws_like($$
  update public.transactions set status = 'voided', voided_at = now(),
    voided_by = 'da000000-0000-0000-0000-000000000001', void_reason = 'test'
  where id = 'da000000-0000-0000-0000-000000000003'
$$, '%chk_bank_transfer_void_must_be_unconfirmed%', 'confirmed transfer cannot be voided');

select * from finish();
rollback;
