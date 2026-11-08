-- Concurrency tests for checkout_transaction_idempotent
-- Tests are structured to be run sequentially but verify concurrent-safe behavior
-- by examining DB invariants after racing scenarios.
-- Full concurrent session tests require pg_background or pgbench (see notes below).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(14);

-- ─── Fixture ────────────────────────────────────────────────────────────────
insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('cc000000-0000-4000-8000-000000000001','CONC','Concurrency test product','TAB',true,false);

insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values
  ('cc000000-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000001','TAB',1,1000,true),
  ('cc000000-0000-4000-8000-000000000003','cc000000-0000-4000-8000-000000000001','Box',10,8000,false);

insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('cc000000-0000-4000-8000-000000000004','cc000000-0000-4000-8000-000000000001','LOT-A','2035-01-01',20,500);

insert into employees(id,full_name,position) values
  ('cc000000-0000-4000-8000-000000000005','Cashier Alpha','kasir'),
  ('cc000000-0000-4000-8000-000000000006','Cashier Beta','kasir');

-- Request IDs
-- R1: used by cashier Alpha for 3 TAB, cash
-- R2: used by cashier Beta for 2 TAB, cash
-- R3: different payload reuse attempt (conflict)
-- R4: insufficient-stock retry
-- R5: BEBAS prescription checkout
-- R6: multi-unit (Box) checkout
-- R7: null request_id
-- R8: isolation test (different employee, same key → conflict)

-- ─── Test 1: First call creates transaction ──────────────────────────────────
create temp table r1_first as
  select checkout_transaction_idempotent(
    'cc000000-0001-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":3}]',
    3000,
    '{"prescription_category":"bebas"}'
  ) data;

select ok((select (data->>'total_amount')::numeric > 0 from r1_first),
  'test 1: first call returns a completed transaction with total_amount');

-- ─── Test 2: Exact replay returns same transaction_id ───────────────────────
create temp table r1_replay as
  select checkout_transaction_idempotent(
    'cc000000-0001-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":3}]',
    3000,
    '{"prescription_category":"bebas"}'
  ) data;

select is(
  (select data->>'transaction_id' from r1_replay),
  (select data->>'transaction_id' from r1_first),
  'test 2: exact replay returns identical transaction_id');

-- ─── Test 3: Stock deducted exactly once across first+replay ────────────────
select is(
  (select quantity from product_batches where id='cc000000-0000-4000-8000-000000000004'),
  17,
  'test 3: stock deducted exactly once (20 - 3 = 17) despite replay');

-- ─── Test 4: One checkout_requests row for the request ──────────────────────
select is(
  (select count(*)::int from checkout_requests
   where request_id='cc000000-0001-4000-8000-000000000000'),
  1,
  'test 4: exactly one idempotency row exists for the request');

-- ─── Test 5: Payload conflict (same key, different quantity) → CHECKOUT_REQUEST_CONFLICT
select throws_ok(
  $$select checkout_transaction_idempotent(
    'cc000000-0001-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":5}]',
    5000,
    '{"prescription_category":"bebas"}'
  )$$,
  'P0001','CHECKOUT_REQUEST_CONFLICT',
  'test 5: different quantity with same request_id raises CHECKOUT_REQUEST_CONFLICT');

-- ─── Test 6: Employee isolation (different employee, same key) ───────────────
select throws_ok(
  $$select checkout_transaction_idempotent(
    'cc000000-0001-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000006',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":3}]',
    3000,
    '{"prescription_category":"bebas"}'
  )$$,
  'P0001','CHECKOUT_REQUEST_CONFLICT',
  'test 6: different employee_id with same request_id raises CHECKOUT_REQUEST_CONFLICT');

-- ─── Test 7: NULL request_id → INVALID_CHECKOUT_REQUEST_ID ─────────────────
select throws_ok(
  $$select checkout_transaction_idempotent(
    null,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":1}]',
    1000,
    '{"prescription_category":"bebas"}'
  )$$,
  'P0001','INVALID_CHECKOUT_REQUEST_ID',
  'test 7: null request_id raises INVALID_CHECKOUT_REQUEST_ID');

-- ─── Test 8: Independent second cashier with their own key ──────────────────
create temp table r2_first as
  select checkout_transaction_idempotent(
    'cc000000-0002-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000006',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":2}]',
    2000,
    '{"prescription_category":"bebas"}'
  ) data;

select ok(
  (select data->>'transaction_id' from r2_first) <>
  (select data->>'transaction_id' from r1_first),
  'test 8: second cashier with different key gets an independent transaction');

-- ─── Test 9: Stock reflects both transactions ────────────────────────────────
select is(
  (select quantity from product_batches where id='cc000000-0000-4000-8000-000000000004'),
  15,
  'test 9: stock reflects both cashier Alpha (3) and Beta (2): 20-3-2=15');

-- ─── Test 10: UMUM prescription metadata persisted ──────────────────────────
create temp table r3_umum as
  select checkout_transaction_idempotent(
    'cc000000-0003-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":1}]',
    1000,
    '{"prescription_category":"umum","patient_name":"Budi","prescription_origin":"dr. Sari","prescription_number":"R-001","prescription_date":"2026-11-08"}'
  ) data;

select ok(
  (select data->>'invoice_number' from r3_umum) is not null,
  'test 10: UMUM prescription checkout returns invoice_number');

-- ─── Test 11: BPJS checkout with zero cash_received ─────────────────────────
create temp table r4_bpjs as
  select checkout_transaction_idempotent(
    'cc000000-0004-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'bpjs',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":1}]',
    0,
    '{"prescription_category":"bpjs","bpjs_number":"0001234567"}'
  ) data;

select is(
  (select (data->>'cash_change')::numeric from r4_bpjs),
  0::numeric,
  'test 11: BPJS checkout returns zero cash_change');

-- ─── Test 12: Box unit (conversion=10) deducts 10 base stock per box ────────
create temp table r5_box as
  select checkout_transaction_idempotent(
    'cc000000-0005-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000006',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000003","quantity":1}]',
    8000,
    '{"prescription_category":"bebas"}'
  ) data;

-- After: Alpha=3, Beta=2, UMUM=1, BPJS=1, Box=10 → 20-3-2-1-1-10=3
select is(
  (select quantity from product_batches where id='cc000000-0000-4000-8000-000000000004'),
  3,
  'test 12: box unit deducts 10 base stock (conversion_to_base=10)');

-- ─── Test 13: Insufficient stock raises INSUFFICIENT_STOCK ───────────────────
select throws_ok(
  $$select checkout_transaction_idempotent(
    'cc000000-0006-4000-8000-000000000000'::uuid,
    'cc000000-0000-4000-8000-000000000005',
    'cash',
    '[{"product_unit_id":"cc000000-0000-4000-8000-000000000002","quantity":10}]',
    10000,
    '{"prescription_category":"bebas"}'
  )$$,
  'P0001','INSUFFICIENT_STOCK',
  'test 13: request exceeding remaining stock raises INSUFFICIENT_STOCK');

-- ─── Test 14: Failed checkout (INSUFFICIENT_STOCK) leaves no idempotency row ─
select is(
  (select count(*)::int from checkout_requests
   where request_id='cc000000-0006-4000-8000-000000000000'),
  0,
  'test 14: failed checkout leaves no checkout_requests row (rollback works)');

select * from finish();
rollback;
