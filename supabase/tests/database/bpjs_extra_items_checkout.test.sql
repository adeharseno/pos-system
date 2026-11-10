begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(14);

-- 1. Setup Master Data
insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('b6000000-0000-4000-8000-000000000001','BPJS-ACARBOSE','BPJS ACARBOSE 50 TAB','TAB',true,false);

insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values('b6000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001','TAB',1,700,true);

insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('b6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001','BATCH-BPJS-01','2035-01-01',100,500);

insert into employees(id,full_name,position)
values('b6000000-0000-4000-8000-000000000004','BPJS Cashier','kasir');

-- Test 1: BPJS checkout without supplementary items (backward compatibility)
create temporary table res_standard as select checkout_transaction_idempotent(
  'b6000000-0000-4000-8000-000000000010',
  'b6000000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"b6000000-0000-4000-8000-000000000002","quantity":5}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000123","prescription_number":"RX-001","doctor_name":"dr. Test","patient_name":"Pasien BPJS 1"}'
) data;

select is((select (data->>'total_amount')::numeric from res_standard), 3500::numeric, 'standard BPJS total is correct');
select is((select count(*) from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_standard)), 0::bigint, 'no supplementary items created when null');

-- Test 2: BPJS checkout with 1 supplementary item (ACARBOSE 10 @ 700 = 7000, BPJS ALPARA 1 @ 20000 = 20000 => Total 27000)
create temporary table res_single_extra as select checkout_transaction_idempotent(
  'b6000000-0000-4000-8000-000000000020',
  'b6000000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"b6000000-0000-4000-8000-000000000002","quantity":10}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000456","prescription_number":"RX-002","doctor_name":"dr. Test","patient_name":"Pasien BPJS 2"}',
  '[{"drug_name":"BPJS ALPARA","quantity":1,"unit_price":20000}]'
) data;

select is((select (data->>'total_amount')::numeric from res_single_extra), 27000::numeric, 'RPC returns total_amount 27000 including extra item');
select is((select total_amount from transactions where id = (select (data->>'transaction_id')::uuid from res_single_extra)), 27000::numeric, 'transactions table total_amount is 27000');
select is((select subtotal from transactions where id = (select (data->>'transaction_id')::uuid from res_single_extra)), 27000::numeric, 'transactions table subtotal is 27000');

select is((select count(*) from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_single_extra)), 1::bigint, '1 row inserted in bpjs_susulan_items');
select is((select drug_name from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_single_extra)), 'BPJS ALPARA', 'supplementary drug_name matches');
select is((select line_total from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_single_extra)), 20000::numeric, 'supplementary line_total is 20000');

-- Test 3: Stock verification
-- Total main stock deducted: 5 (Test 1) + 10 (Test 2) = 15. Initial 100 => 85.
select is((select quantity from product_batches where id = 'b6000000-0000-4000-8000-000000000003'), 85, 'main product batch stock deducted correctly by 15');

-- Test 4: Idempotency with supplementary items
create temporary table res_replay as select checkout_transaction_idempotent(
  'b6000000-0000-4000-8000-000000000020',
  'b6000000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"b6000000-0000-4000-8000-000000000002","quantity":10}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000456","prescription_number":"RX-002","doctor_name":"dr. Test","patient_name":"Pasien BPJS 2"}',
  '[{"drug_name":"BPJS ALPARA","quantity":1,"unit_price":20000}]'
) data;

select is((select data->>'transaction_id' from res_replay), (select data->>'transaction_id' from res_single_extra), 'idempotency replay returns exact same transaction_id');
select is((select (data->>'total_amount')::numeric from res_replay), 27000::numeric, 'idempotency replay returns 27000 total_amount');
select is((select count(*) from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from res_single_extra)), 1::bigint, 'idempotency replay does not duplicate bpjs_susulan_items');

-- Test 5: Validation and Rollback Atomicity
-- Should fail if supplementary item quantity <= 0
select throws_ok($$select checkout_transaction_idempotent(
  'b6000000-0000-4000-8000-000000000030',
  'b6000000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"b6000000-0000-4000-8000-000000000002","quantity":1}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000789","prescription_number":"RX-003"}',
  '[{"drug_name":"INVALID ITEM","quantity":0,"unit_price":1000}]'
)$$, 'P0001', 'SUSULAN_INVALID_QUANTITY', 'rejects non-positive quantity and rolls back');

-- Should fail if supplementary drug_name is empty
select throws_ok($$select checkout_transaction_idempotent(
  'b6000000-0000-4000-8000-000000000031',
  'b6000000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"b6000000-0000-4000-8000-000000000002","quantity":1}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000789","prescription_number":"RX-004"}',
  '[{"drug_name":"   ","quantity":1,"unit_price":1000}]'
)$$, 'P0001', 'SUSULAN_DRUG_NAME_REQUIRED', 'rejects empty drug name and rolls back');

select * from finish();
rollback;
