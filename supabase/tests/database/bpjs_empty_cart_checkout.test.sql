begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(13);

-- Setup Employee
insert into employees(id,full_name,position)
values('b6100000-0000-4000-8000-000000000004','BPJS Cashier Empty Cart','kasir');

-- 1. BPJS checkout with empty items and 1 supplementary item succeeds
create temporary table res_empty_cart as select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000010',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"BPJS-EMPTY-01","patient_name":"Pasien BPJS Empty","prescription_origin":"RSUD"}'::jsonb,
  '[{"drug_name":"BPJS EXTRA MED 1","quantity":2,"unit_price":15000}]'::jsonb
) data;

select is((select (data->>'total_amount')::numeric from res_empty_cart), 30000::numeric, 'empty cart BPJS returns 30000 total');
select is((select (data->>'subtotal')::numeric from res_empty_cart), 30000::numeric, 'empty cart BPJS returns 30000 subtotal');
select is((select total_amount from transactions where id = (select (data->>'transaction_id')::uuid from res_empty_cart)), 30000::numeric, 'transactions total_amount matches in db');
select is((select count(*) from transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from res_empty_cart)), 0::bigint, 'zero rows in transaction_items');
select is((select count(*) from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_empty_cart)), 1::bigint, '1 row in bpjs_susulan_items');

-- 2. Idempotency on empty cart BPJS checkout
create temporary table res_empty_replay as select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000010',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"BPJS-EMPTY-01","patient_name":"Pasien BPJS Empty","prescription_origin":"RSUD"}'::jsonb,
  '[{"drug_name":"BPJS EXTRA MED 1","quantity":2,"unit_price":15000}]'::jsonb
) data;

select is((select data->>'transaction_id' from res_empty_replay), (select data->>'transaction_id' from res_empty_cart), 'idempotency replay returns exact same transaction_id');
select is((select (data->>'total_amount')::numeric from res_empty_replay), 30000::numeric, 'idempotency replay returns 30000 total_amount');
select is((select count(*) from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_empty_cart)), 1::bigint, 'idempotency replay does not duplicate bpjs_susulan_items');

-- 3. Conflict detection on fingerprint mismatch
select throws_ok($$select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000010',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"BPJS-EMPTY-02","patient_name":"Different Patient"}'::jsonb,
  '[{"drug_name":"DIFFERENT MED","quantity":1,"unit_price":10000}]'::jsonb
)$$, 'P0001', 'CHECKOUT_REQUEST_CONFLICT', 'rejects conflict when parameters differ');

-- 4. Rejections
-- Empty cart with non-BPJS raises INVALID_CART
select throws_ok($$select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000020',
  'b6100000-0000-4000-8000-000000000004',
  'cash',
  '[]'::jsonb,
  0,
  null,
  null
)$$, 'P0001', 'INVALID_CART', 'empty cart cash rejects with INVALID_CART');

-- Empty cart BPJS without supplementary items raises INVALID_CART
select throws_ok($$select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000021',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"123","patient_name":"Ahmad"}'::jsonb,
  '[]'::jsonb
)$$, 'P0001', 'INVALID_CART', 'empty cart BPJS without supplementary items rejects with INVALID_CART');

-- Empty cart BPJS missing patient_name raises PATIENT_NAME_REQUIRED
select throws_ok($$select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000022',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"123","patient_name":"   "}'::jsonb,
  '[{"drug_name":"BPJS EXTRA MED 1","quantity":1,"unit_price":15000}]'::jsonb
)$$, 'P0001', 'PATIENT_NAME_REQUIRED', 'empty cart BPJS missing patient name rejects with PATIENT_NAME_REQUIRED');

-- Empty cart BPJS missing bpjs_number raises BPJS_NUMBER_REQUIRED
select throws_ok($$select checkout_transaction_idempotent(
  'b6100000-0000-4000-8000-000000000023',
  'b6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"   ","patient_name":"Ahmad"}'::jsonb,
  '[{"drug_name":"BPJS EXTRA MED 1","quantity":1,"unit_price":15000}]'::jsonb
)$$, 'P0001', 'BPJS_NUMBER_REQUIRED', 'empty cart BPJS missing bpjs_number rejects with BPJS_NUMBER_REQUIRED');

select * from finish();
rollback;

