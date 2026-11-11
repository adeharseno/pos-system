begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into public.categories(id, name)
values ('e8100000-0000-4000-8000-000000000001', 'Instant Payment Category');
insert into public.subcategories(id, name)
values ('e8200000-0000-4000-8000-000000000001', 'Instant Payment Subcategory');
insert into public.products(id, sku, name, category_id, subcategory_id, base_unit, tax_rate, is_taxable)
values (
  'e8300000-0000-4000-8000-000000000001',
  'INSTANT-PAY-01',
  'Paracetamol 500 Instant Test',
  'e8100000-0000-4000-8000-000000000001',
  'e8200000-0000-4000-8000-000000000001',
  'Tablet',
  0,
  false
);
insert into public.product_units(id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
values ('e8400000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000001', 'Tablet', 1, 12000, true);
insert into public.product_batches(id, product_id, batch_number, expired_date, quantity, cost_price, created_at)
values ('e8500000-0000-4000-8000-000000000001', 'e8300000-0000-4000-8000-000000000001', 'INST-B1', '2030-01-01', 20, 8000, '2026-01-01');
insert into public.employees(id, full_name, position) values
  ('e8600000-0000-4000-8000-000000000001', 'Kasir Instant Test', 'kasir'),
  ('e8600000-0000-4000-8000-000000000002', 'Owner Instant Test', 'owner_admin');

create temporary table baseline_reports as
with today_bounds as (
  select (clock_timestamp() at time zone 'Asia/Jakarta')::date as d
)
select
  coalesce((
    select (x->>'paymentsReceived')::numeric
    from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x
    where x->>'method' = 'qris'
  ), 0) as qris_received,
  coalesce((
    select (x->>'paymentsReceived')::numeric
    from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x
    where x->>'method' = 'bank_transfer'
  ), 0) as bank_received,
  coalesce((
    select (x->>'paymentsReceived')::numeric
    from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x
    where x->>'method' = 'cash'
  ), 0) as cash_received,
  (public.sales_gross_profit_report(d, d)->>'salesRevenue')::numeric as gross_revenue,
  coalesce((
    select sum((p->>'revenue')::numeric)
    from jsonb_array_elements(public.dashboard_analytics_report(d, d, extract(year from d)::int)->'daily') p
  ), 0) as dashboard_revenue
from today_bounds;

-- 1. QRIS BEBAS instant completion
create temporary table qris_bebas as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000001',
  'e8600000-0000-4000-8000-000000000001',
  'qris',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select data->>'status' = 'completed'
      and (data->>'tax_amount')::numeric = 0
      and (data->>'total_amount')::numeric = 24000
      and data->>'cash_change' is null
   from qris_bebas),
  'QRIS BEBAS RPC returns status=completed, tax=0, total=24000, cash_change=null'
);

select ok(
  (select payment_method::text = 'qris'
      and status = 'completed'
      and cash_received is null
      and cash_change is null
      and payment_confirmed_at is not null
      and payment_confirmed_by = 'e8600000-0000-4000-8000-000000000001'
   from public.transactions
   where id = (select (data->>'transaction_id')::uuid from qris_bebas)),
  'QRIS transaction persists completed status, confirmation audit, and null cash columns'
);

select is(
  (select quantity from public.product_batches where id = 'e8500000-0000-4000-8000-000000000001'),
  18,
  'QRIS checkout deducts stock immediately via FEFO'
);

-- 2. Bank Transfer BEBAS instant completion
create temporary table bank_bebas as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000002',
  'e8600000-0000-4000-8000-000000000001',
  'bank_transfer',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select data->>'status' = 'completed'
      and (data->>'tax_amount')::numeric = 0
      and (data->>'total_amount')::numeric = 12000
      and data->>'cash_change' is null
   from bank_bebas),
  'Bank Transfer BEBAS RPC returns status=completed, tax=0, total=12000, cash_change=null'
);

select ok(
  (select payment_method::text = 'bank_transfer'
      and status = 'completed'
      and cash_received is null
      and cash_change is null
      and payment_confirmed_at is not null
      and payment_confirmed_by = 'e8600000-0000-4000-8000-000000000001'
   from public.transactions
   where id = (select (data->>'transaction_id')::uuid from bank_bebas)),
  'Bank Transfer transaction persists completed status, confirmation audit, and null cash columns'
);

select is(
  (select quantity from public.product_batches where id = 'e8500000-0000-4000-8000-000000000001'),
  17,
  'Bank Transfer checkout deducts stock immediately via FEFO'
);

-- 3. UMUM category works identically for QRIS and Bank Transfer
create temporary table qris_umum as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000003',
  'e8600000-0000-4000-8000-000000000001',
  'qris',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"umum","patient_name":"Pasien QRIS","prescription_origin":"dr. Sinta"}'::jsonb,
  null
) data;

create temporary table bank_umum as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000004',
  'e8600000-0000-4000-8000-000000000001',
  'bank_transfer',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"umum","patient_name":"Pasien Bank","prescription_origin":"dr. Budi"}'::jsonb,
  null
) data;

select ok(
  (select status = 'completed' and payment_method::text = 'qris'
   from public.transactions where id = (select (data->>'transaction_id')::uuid from qris_umum))
  and exists(
    select 1 from public.transaction_prescriptions
    where transaction_id = (select (data->>'transaction_id')::uuid from qris_umum)
      and prescription_category = 'umum' and patient_name = 'Pasien QRIS'
  ),
  'UMUM QRIS completes immediately and persists prescription metadata'
);

select ok(
  (select status = 'completed' and payment_method::text = 'bank_transfer'
   from public.transactions where id = (select (data->>'transaction_id')::uuid from bank_umum))
  and exists(
    select 1 from public.transaction_prescriptions
    where transaction_id = (select (data->>'transaction_id')::uuid from bank_umum)
      and prescription_category = 'umum' and patient_name = 'Pasien Bank'
  ),
  'UMUM Bank Transfer completes immediately and persists prescription metadata'
);

-- 4. Idempotent replay (double click / retry) does not duplicate tx or deduct stock twice
create temporary table qris_replay as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000001',
  'e8600000-0000-4000-8000-000000000001',
  'qris',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

create temporary table bank_replay as
select public.checkout_transaction_idempotent(
  'e8900000-0000-4000-8000-000000000002',
  'e8600000-0000-4000-8000-000000000001',
  'bank_transfer',
  '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select r.data->>'transaction_id' = q.data->>'transaction_id'
      and r.data->>'invoice_number' = q.data->>'invoice_number'
      and r.data->>'status' = 'completed'
   from qris_replay r, qris_bebas q)
  and (select r.data->>'transaction_id' = b.data->>'transaction_id'
      and r.data->>'invoice_number' = b.data->>'invoice_number'
      and r.data->>'status' = 'completed'
   from bank_replay r, bank_bebas b),
  'Idempotent retry returns identical completed transaction and invoice for QRIS & Bank Transfer'
);

select is(
  (select quantity from public.product_batches where id = 'e8500000-0000-4000-8000-000000000001'),
  15,
  'Idempotent replay leaves stock untouched (20 - 2 - 1 - 1 - 1 = 15)'
);

-- 5. Cash amount rejected for non-cash payment methods
select throws_ok($$
  select public.checkout_transaction_idempotent(
    'e8900000-0000-4000-8000-000000000005',
    'e8600000-0000-4000-8000-000000000001',
    'qris',
    '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    12000,
    '{"prescription_category":"bebas"}'::jsonb,
    null
  )
$$, 'P0001', 'INVALID_PAYMENT_DATA', 'QRIS rejects non-null cash_received');

select throws_ok($$
  select public.checkout_transaction_idempotent(
    'e8900000-0000-4000-8000-000000000006',
    'e8600000-0000-4000-8000-000000000001',
    'bank_transfer',
    '[{"product_unit_id":"e8400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
    12000,
    '{"prescription_category":"bebas"}'::jsonb,
    null
  )
$$, 'P0001', 'INVALID_PAYMENT_DATA', 'Bank Transfer rejects non-null cash_received');

select is(
  (select quantity from public.product_batches where id = 'e8500000-0000-4000-8000-000000000001'),
  15,
  'Failed validation checkout does not deduct stock'
);

-- 6. Financial reports recognize settled QRIS/Bank Transfer immediately without inflating cash
select is(
  (with today_bounds as (select (clock_timestamp() at time zone 'Asia/Jakarta')::date as d)
   select coalesce((select (x->>'paymentsReceived')::numeric from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x where x->>'method' = 'qris'), 0)
        - (select qris_received from baseline_reports)
   from today_bounds),
  36000::numeric,
  'payment_refund_report counts instant QRIS sales (24000 + 12000 = 36000) immediately'
);

select is(
  (with today_bounds as (select (clock_timestamp() at time zone 'Asia/Jakarta')::date as d)
   select coalesce((select (x->>'paymentsReceived')::numeric from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x where x->>'method' = 'bank_transfer'), 0)
        - (select bank_received from baseline_reports)
   from today_bounds),
  24000::numeric,
  'payment_refund_report counts instant Bank Transfer sales (12000 + 12000 = 24000) immediately'
);

select ok(
  (with today_bounds as (select (clock_timestamp() at time zone 'Asia/Jakarta')::date as d)
   select coalesce((select (x->>'paymentsReceived')::numeric from jsonb_array_elements(public.payment_refund_report(d, d)->'methods') x where x->>'method' = 'cash'), 0) = (select cash_received from baseline_reports)
      and (public.sales_gross_profit_report(d, d)->>'salesRevenue')::numeric - (select gross_revenue from baseline_reports) = 60000
      and coalesce((select sum((p->>'revenue')::numeric) from jsonb_array_elements(public.dashboard_analytics_report(d, d, extract(year from d)::int)->'daily') p), 0) - (select dashboard_revenue from baseline_reports) = 60000
   from today_bounds),
  'Instant non-cash checkouts do not enter cash bucket while gross profit & dashboard reflect +60000 revenue immediately'
);

-- 7. Manual re-confirmation and direct void rejected on settled non-cash sales
select throws_ok(format(
  'select public.confirm_qris_payment(%L, %L)',
  (select (data->>'transaction_id')::uuid from qris_bebas),
  'e8600000-0000-4000-8000-000000000002'
), 'P0001', 'QRIS_ALREADY_CONFIRMED', 'Instant completed QRIS rejects repeat confirm_qris_payment');

select throws_ok(format(
  'select public.confirm_qris_payment(%L, %L)',
  (select (data->>'transaction_id')::uuid from bank_bebas),
  'e8600000-0000-4000-8000-000000000002'
), 'P0001', 'BANK_TRANSFER_ALREADY_CONFIRMED', 'Instant completed Bank Transfer rejects repeat confirm_qris_payment');

select throws_ok(format(
  'select public.void_transaction(%L, %L, %L)',
  (select (data->>'transaction_id')::uuid from qris_bebas),
  'e8600000-0000-4000-8000-000000000002',
  'coba void instant qris'
), 'P0001', 'PAID_TRANSACTION_REQUIRES_RETURN', 'Instant completed QRIS cannot be voided directly');

select throws_like(format(
  'select public.void_transaction(%L, %L, %L)',
  (select (data->>'transaction_id')::uuid from bank_bebas),
  'e8600000-0000-4000-8000-000000000002',
  'coba void instant bank'
), '%chk_bank_transfer_void_must_be_unconfirmed%', 'Instant completed Bank Transfer cannot be voided directly');

-- 8. Customer return works immediately on instant-completed QRIS & Bank Transfer
create temporary table qris_ret as
select public.request_customer_return(
  'e8600000-0000-4000-8000-000000000001',
  (select (data->>'transaction_id')::uuid from qris_bebas),
  'qris',
  'Retur QRIS',
  jsonb_build_array(jsonb_build_object(
    'transaction_item_id',
    (select id from public.transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from qris_bebas) limit 1),
    'quantity_in_base',
    1
  ))
) data;

select public.approve_customer_return(
  'e8600000-0000-4000-8000-000000000002',
  (select (data->>'return_id')::uuid from qris_ret),
  'Setujui retur instant QRIS'
);

create temporary table bank_ret as
select public.request_customer_return(
  'e8600000-0000-4000-8000-000000000001',
  (select (data->>'transaction_id')::uuid from bank_bebas),
  'bank_transfer',
  'Retur Bank Transfer',
  jsonb_build_array(jsonb_build_object(
    'transaction_item_id',
    (select id from public.transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from bank_bebas) limit 1),
    'quantity_in_base',
    1
  ))
) data;

select public.approve_customer_return(
  'e8600000-0000-4000-8000-000000000002',
  (select (data->>'return_id')::uuid from bank_ret),
  'Setujui retur instant Bank Transfer'
);

select is(
  (select quantity from public.product_batches where id = 'e8500000-0000-4000-8000-000000000001'),
  17,
  'Approved customer returns on instant QRIS & Bank Transfer restore returned stock (15 + 2 = 17)'
);

-- 9. Historical / existing pending_payment transactions remain confirmable & voidable
insert into public.transactions(
  id, invoice_number, cashier_id, subtotal, tax_amount, total_amount, payment_method, status
) values (
  'e8700000-0000-4000-8000-000000000001',
  'INV-HIST-PENDING-QRIS',
  'e8600000-0000-4000-8000-000000000001',
  12000, 0, 12000, 'qris', 'pending_payment'
), (
  'e8700000-0000-4000-8000-000000000002',
  'INV-HIST-PENDING-BANK',
  'e8600000-0000-4000-8000-000000000001',
  12000, 0, 12000, 'bank_transfer', 'pending_payment'
);

select lives_ok($$
  select public.confirm_qris_payment('e8700000-0000-4000-8000-000000000001', 'e8600000-0000-4000-8000-000000000002');
$$, 'Historical pending_payment QRIS can still be manually confirmed');

select lives_ok($$
  select public.void_transaction('e8700000-0000-4000-8000-000000000002', 'e8600000-0000-4000-8000-000000000002', 'Cancel legacy pending bank transfer');
$$, 'Historical pending_payment Bank Transfer can still be voided');

-- 10. Daily sales totals view tracks settled QRIS and Bank Transfer accurately
select ok(
  exists(
    select 1 from public.daily_sales_totals
    where cashier_id = 'e8600000-0000-4000-8000-000000000001'
      and payment_method = 'qris'
      and completed_total >= 36000
  ) and exists(
    select 1 from public.daily_sales_totals
    where cashier_id = 'e8600000-0000-4000-8000-000000000001'
      and payment_method = 'bank_transfer'
      and completed_total >= 24000
  ),
  'daily_sales_totals reflects instant-completed QRIS & Bank Transfer'
);

select * from finish();
rollback;

