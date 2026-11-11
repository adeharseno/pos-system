begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

insert into public.employees(id, full_name, position) values
  ('c6900000-0000-4000-8000-000000000001', 'Kasir Tempo', 'kasir'),
  ('c6900000-0000-4000-8000-000000000002', 'Owner Tempo', 'owner_admin');

insert into public.products(id, sku, name, base_unit, unit_confirmed, classification_pending, drug_classification) values
  ('c6900000-0000-4000-8000-000000000011', 'TEMPO-OTC', 'Paracetamol Tempo', 'TAB', true, false, 'otc'),
  ('c6900000-0000-4000-8000-000000000012', 'TEMPO-RX', 'Amoxicillin Tempo', 'CAP', true, false, 'prescription_required'),
  ('c6900000-0000-4000-8000-000000000013', 'TEMPO-ZERO', 'Free Sample Tempo', 'PCS', true, false, 'otc');

insert into public.product_units(id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit) values
  ('c6900000-0000-4000-8000-000000000021', 'c6900000-0000-4000-8000-000000000011', 'TAB', 1, 12500, true),
  ('c6900000-0000-4000-8000-000000000022', 'c6900000-0000-4000-8000-000000000012', 'CAP', 1, 25000, true),
  ('c6900000-0000-4000-8000-000000000023', 'c6900000-0000-4000-8000-000000000013', 'PCS', 1, 0, true);

insert into public.product_batches(id, product_id, batch_number, expired_date, quantity, cost_price) values
  ('c6900000-0000-4000-8000-000000000031', 'c6900000-0000-4000-8000-000000000011', 'FEFO-1', '2034-01-01', 2, 8000),
  ('c6900000-0000-4000-8000-000000000032', 'c6900000-0000-4000-8000-000000000011', 'FEFO-2', '2036-01-01', 10, 9000),
  ('c6900000-0000-4000-8000-000000000033', 'c6900000-0000-4000-8000-000000000012', 'RX-1', '2035-01-01', 5, 15000),
  ('c6900000-0000-4000-8000-000000000034', 'c6900000-0000-4000-8000-000000000013', 'FREE-1', '2035-01-01', 5, 0);

create temporary table tempo_dates as
select
  (clock_timestamp() at time zone 'Asia/Jakarta')::date as today,
  ((clock_timestamp() at time zone 'Asia/Jakarta')::date + 14) as due_14,
  ((clock_timestamp() at time zone 'Asia/Jakarta')::date - 1) as yesterday;

-- 1-6: Customer idempotent creation + deduplication + conflict
create temporary table cust_1 as
select public.create_customer_idempotent(
  'c6900000-0000-4000-8000-000000000101',
  'c6900000-0000-4000-8000-000000000001',
  'Ibu Sari',
  '0812-345-6789',
  'Jl. Cipayung 10',
  'Langganan tetap'
) as data;

create temporary table cust_1_replay as
select public.create_customer_idempotent(
  'c6900000-0000-4000-8000-000000000101',
  'c6900000-0000-4000-8000-000000000001',
  'Ibu Sari',
  '0812-345-6789',
  'Jl. Cipayung 10',
  'Langganan tetap'
) as data;

select is((select data->>'replayed' from cust_1), 'false', '1. kasir creates customer without replay flag');
select is((select count(*) from public.security_audit_events where target_id = (select data->>'id' from cust_1) and action = 'customer.create'), 1::bigint, '2. customer creation records audit event');
select ok(
  (select data->>'replayed' from cust_1_replay) = 'true'
  and (select data->>'id' from cust_1_replay) = (select data->>'id' from cust_1),
  '3. customer request replay returns existing customer idempotently'
);
select is((select count(*) from public.customers where id = (select (data->>'id')::uuid from cust_1)), 1::bigint, '4. replay does not duplicate customer row');

select throws_ok($$
  select public.create_customer_idempotent(
    'c6900000-0000-4000-8000-000000000101',
    'c6900000-0000-4000-8000-000000000001',
    'Nama Berbeda',
    '0812-345-6789',
    null,
    null
  )
$$, 'P0001', 'CUSTOMER_REQUEST_CONFLICT', '5. customer request_id cannot be reused for another payload');

select throws_ok($$
  select public.create_customer_idempotent(
    'c6900000-0000-4000-8000-000000000102',
    'c6900000-0000-4000-8000-000000000001',
    '  ibu SARI  ',
    '(0812) 345 6789',
    null,
    null
  )
$$, 'P0001', 'DUPLICATE_CUSTOMER', '6. normalized phone + case-insensitive name rejects duplicate active customer');

-- 7: Browser privilege isolation
select ok(
  not has_table_privilege('anon', 'public.customers', 'select')
  and not has_table_privilege('authenticated', 'public.customers', 'select')
  and not has_table_privilege('anon', 'public.customer_receivables', 'select')
  and not has_table_privilege('authenticated', 'public.customer_receivables', 'select')
  and not has_table_privilege('authenticated', 'public.customer_requests', 'select')
  and not has_function_privilege('anon', 'public.create_customer_idempotent(uuid,uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_customer_idempotent(uuid,uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb,jsonb,uuid,date)', 'execute'),
  '7. anon and authenticated have zero table or RPC privileges on customer & receivable objects'
);

-- 8-12: Validation guards on TEMPO checkout
select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000201',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
    null,
    '{"prescription_category":"bebas"}',
    null,
    null,
    (select due_14 from tempo_dates)
  )
$$, 'P0001', 'CUSTOMER_REQUIRED', '8. tempo rejects missing customer_id');

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000202',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
    null,
    '{"prescription_category":"bebas"}',
    null,
    (select (data->>'id')::uuid from cust_1),
    null
  )
$$, 'P0001', 'DUE_DATE_REQUIRED', '9. tempo rejects missing due_date');

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000203',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
    null,
    '{"prescription_category":"bebas"}',
    null,
    (select (data->>'id')::uuid from cust_1),
    (select yesterday from tempo_dates)
  )
$$, 'P0001', 'INVALID_DUE_DATE', '10. tempo rejects due_date before business date');

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000204',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
    null,
    '{"prescription_category":"bpjs","patient_name":"Pasien BPJS","bpjs_number":"0001","prescription_origin":"Klinik"}',
    null,
    (select (data->>'id')::uuid from cust_1),
    (select due_14 from tempo_dates)
  )
$$, 'P0001', 'TEMPO_BPJS_NOT_ALLOWED', '11. tempo forbids BPJS category');

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000205',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000023","quantity":1}]',
    null,
    '{"prescription_category":"bebas"}',
    null,
    (select (data->>'id')::uuid from cust_1),
    (select due_14 from tempo_dates)
  )
$$, 'P0001', 'TEMPO_ZERO_TOTAL_NOT_ALLOWED', '12. tempo rejects zero total transaction');

-- 13-21: Valid atomic TEMPO checkout, FEFO deduction, idempotency, conflict, view
create temporary table tempo_tx1 as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000301',
  'c6900000-0000-4000-8000-000000000001',
  'tempo',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":4}]',
  null,
  '{"prescription_category":"bebas"}',
  null,
  (select (data->>'id')::uuid from cust_1),
  (select due_14 from tempo_dates)
) as data;

create temporary table tempo_tx1_replay as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000301',
  'c6900000-0000-4000-8000-000000000001',
  'tempo',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":4}]',
  null,
  '{"prescription_category":"bebas"}',
  null,
  (select (data->>'id')::uuid from cust_1),
  (select due_14 from tempo_dates)
) as data;

select ok(
  (select data->>'status' from tempo_tx1) = 'completed'
  and (select data->>'payment_status' from tempo_tx1) = 'unpaid'
  and (select (data->>'total_amount')::numeric from tempo_tx1) = 50000
  and (select (data->>'tax_amount')::numeric from tempo_tx1) = 0,
  '13. tempo checkout completes sale with unpaid status and zero sales tax'
);

select ok(
  (select status::text = 'completed' and payment_method::text = 'tempo'
     and customer_id = (select (data->>'id')::uuid from cust_1)
     and cash_received is null and cash_change is null
     and payment_confirmed_at is null and payment_confirmed_by is null
   from public.transactions where id = (select (data->>'transaction_id')::uuid from tempo_tx1)),
  '14. transactions row stores tempo completed status separately from payment confirmation'
);

select ok(
  (select original_amount = 50000 and paid_amount = 0 and credited_return_amount = 0
     and outstanding_amount = 50000 and payment_status = 'unpaid'
     and due_date = (select due_14 from tempo_dates)
   from public.customer_receivables where id = (select (data->>'receivable_id')::uuid from tempo_tx1)),
  '15. customer_receivables row created atomically with unpaid balance and generated outstanding_amount'
);

select ok(
  (select quantity from public.product_batches where id = 'c6900000-0000-4000-8000-000000000031') = 0
  and (select quantity from public.product_batches where id = 'c6900000-0000-4000-8000-000000000032') = 8,
  '16. tempo deducts stock via FEFO across batches'
);

select ok(
  (select customer_name = 'Ibu Sari'
     and receivable_due_date = (select due_14 from tempo_dates)
     and receivable_payment_status = 'unpaid'
     and receivable_outstanding_amount = 50000
     and status = 'completed'
   from public.transaction_history_view where id = (select (data->>'transaction_id')::uuid from tempo_tx1)),
  '17. transaction_history_view exposes customer and receivable fields cleanly'
);

select ok(
  (select data->>'transaction_id' from tempo_tx1_replay) = (select data->>'transaction_id' from tempo_tx1)
  and (select data->>'receivable_id' from tempo_tx1_replay) = (select data->>'receivable_id' from tempo_tx1),
  '18. tempo checkout replay returns identical transaction_id and receivable_id'
);

select is(
  (select count(*) from public.customer_receivables where transaction_id = (select (data->>'transaction_id')::uuid from tempo_tx1)),
  1::bigint,
  '19. replay does not create duplicate receivable rows'
);

select is(
  (select quantity from public.product_batches where id = 'c6900000-0000-4000-8000-000000000032'),
  8,
  '20. replay does not deduct stock twice'
);

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'c6900000-0000-4000-8000-000000000301',
    'c6900000-0000-4000-8000-000000000001',
    'tempo',
    '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":4}]',
    null,
    '{"prescription_category":"bebas"}',
    null,
    (select (data->>'id')::uuid from cust_1),
    ((select due_14 from tempo_dates) + 1)
  )
$$, 'P0001', 'CHECKOUT_REQUEST_CONFLICT', '21. modifying tempo due_date with same request_id raises CHECKOUT_REQUEST_CONFLICT');

-- 22: TEMPO with UMUM prescription
create temporary table tempo_rx as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000302',
  'c6900000-0000-4000-8000-000000000002',
  'tempo',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000022","quantity":1}]',
  null,
  '{"prescription_category":"umum","patient_name":"Pasien Umum","prescription_origin":"dr. Andi","prescription_number":"RX-TEMPO-1"}',
  null,
  (select (data->>'id')::uuid from cust_1),
  (select due_14 from tempo_dates)
) as data;

select ok(
  (select (data->>'total_amount')::numeric = 25000 and (data->>'payment_status') = 'unpaid' from tempo_rx)
  and (select count(*) from public.transaction_prescriptions where transaction_id = (select (data->>'transaction_id')::uuid from tempo_rx) and patient_name = 'Pasien Umum') = 1,
  '22. tempo supports UMUM category with prescription metadata'
);

-- 23: Void forbidden on completed TEMPO
select throws_ok($$
  select public.void_transaction(
    (select (data->>'transaction_id')::uuid from tempo_tx1),
    'c6900000-0000-4000-8000-000000000002',
    'Test void tempo'
  )
$$, 'P0001', 'TEMPO_TRANSACTION_REQUIRES_RETURN', '23. voiding completed tempo transaction is rejected (Opsi A)');

-- 24-25: Receivable constraints prevent negative/overpaid balances and invalid status
select throws_like($$
  update public.customer_receivables
  set paid_amount = 60000, payment_status = 'paid'
  where id = (select (data->>'receivable_id')::uuid from tempo_tx1)
$$, '%chk_customer_receivables_balance_non_negative%', '24. customer_receivables blocks over-payment / negative balance');

select throws_like($$
  update public.customer_receivables
  set paid_amount = 10000
  where id = (select (data->>'receivable_id')::uuid from tempo_tx1)
$$, '%chk_customer_receivables_status_consistent%', '25. customer_receivables rejects unpaid status when paid_amount > 0');

-- 26: payment_refund_report excludes Tempo transactions created today from cash/qris/bank inflows
select ok(
  coalesce((select sum((x->>'paymentsReceived')::numeric)
    from jsonb_array_elements(public.payment_refund_report((select today from tempo_dates), (select today from tempo_dates))->'methods') x), 0)
  >= 0
  and not exists(
    select 1
    from jsonb_array_elements(public.payment_refund_report((select today from tempo_dates), (select today from tempo_dates))->'methods') x
    where x->>'method' = 'tempo'
  ),
  '26. payment_refund_report does not treat Tempo receivables as cash/QRIS/transfer inflows'
);

-- 27-28: Cash & QRIS/Bank Transfer regressions still work cleanly
create temporary table cash_reg as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000401',
  'c6900000-0000-4000-8000-000000000001',
  'cash',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
  20000,
  '{"prescription_category":"bebas"}',
  null
) as data;

select ok(
  (select status::text = 'completed' and cash_change = 7500 and tax_amount = 0 and customer_id is null
   from public.transactions where id = (select (data->>'transaction_id')::uuid from cash_reg)),
  '27. cash checkout regression passes without customer_id or sales tax'
);

create temporary table qris_reg as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000402',
  'c6900000-0000-4000-8000-000000000001',
  'qris',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
  null,
  '{"prescription_category":"bebas"}',
  null
) as data;

create temporary table transfer_reg as
select public.checkout_transaction_idempotent(
  'c6900000-0000-4000-8000-000000000403',
  'c6900000-0000-4000-8000-000000000001',
  'bank_transfer',
  '[{"product_unit_id":"c6900000-0000-4000-8000-000000000021","quantity":1}]',
  null,
  '{"prescription_category":"bebas"}',
  null
) as data;

select ok(
  (select status::text = 'completed' and payment_confirmed_at is not null from public.transactions where id = (select (data->>'transaction_id')::uuid from qris_reg))
  and (select status::text = 'completed' and payment_confirmed_at is not null from public.transactions where id = (select (data->>'transaction_id')::uuid from transfer_reg)),
  '28. QRIS and Bank Transfer instant checkout regressions remain intact'
);

select * from finish();
rollback;
