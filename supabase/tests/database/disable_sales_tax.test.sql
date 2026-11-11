begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- 1. All existing master products have is_taxable = false after migration 0067
select is(
  (select count(*)::integer from public.products where is_taxable = true),
  0,
  'all existing master products have is_taxable = false'
);

-- Setup master data for purchasing + checkout regression tests
insert into public.employees(id, full_name, position) values
  ('d7000000-0000-4000-8000-000000000001', 'Sales Tax Owner', 'owner_admin'),
  ('d7000000-0000-4000-8000-000000000002', 'Sales Tax Kasir', 'kasir');

insert into public.suppliers(id, name) values
  ('d7100000-0000-4000-8000-000000000001', 'Sales Tax Supplier');

insert into public.categories(id, name) values
  ('d7200000-0000-4000-8000-000000000001', 'Sales Tax Category');

insert into public.products(id, sku, name, base_unit, category_id, cost_price, tax_rate, is_taxable, unit_confirmed, classification_pending) values
  ('d7300000-0000-4000-8000-000000000001', 'NO-SALES-TAX-01', 'OBAT BEBAS PAJAK', 'TAB', 'd7200000-0000-4000-8000-000000000001', 10000, 0, false, true, false);

insert into public.product_units(id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit) values
  ('d7400000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'TAB', 1, 15000, true);

-- 2. Finalize purchase receiving with supplier tax 11%:
-- preserves products.tax_rate = 11 & HPP cost_price (11100), keeps products.is_taxable = false
insert into public.purchase_invoices(id, supplier_id, invoice_number, invoice_date, total_amount, created_by, updated_by) values
  ('d7500000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'INV-SUP-TAX-01', '2026-11-11', 111000, 'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001');

select public.write_purchase_invoice_item(
  'd7500000-0000-4000-8000-000000000001',
  'd7600000-0000-4000-8000-000000000001',
  'd7700000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  null,
  'create',
  '{"product_id":"d7300000-0000-4000-8000-000000000001","product_unit_id":"d7400000-0000-4000-8000-000000000001","cost_price":"10000.00","tax_rate":"11","selling_price":"15000.00","margin_percent":null,"pricing_mode":"selling_price","quantity":"10","batch_number":"TAX-BATCH-01","expired_date":"2035-01-01"}'::jsonb
);

create temporary table rx_plan as
select public.preview_purchase_receiving('d7500000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001') data;

select public.finalize_purchase_receiving(
  'd7500000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7800000-0000-4000-8000-000000000001',
  (select (data->>'version')::integer from rx_plan),
  (select data->>'token' from rx_plan),
  true
);

select is(
  (select is_taxable from public.products where id = 'd7300000-0000-4000-8000-000000000001'),
  false,
  'finalize_purchase_receiving with supplier tax_rate=11 leaves products.is_taxable false'
);
select is(
  (select tax_rate from public.products where id = 'd7300000-0000-4000-8000-000000000001'),
  11.00::numeric,
  'finalize_purchase_receiving preserves supplier tax_rate=11 on product'
);
select is(
  (select cost_price from public.products where id = 'd7300000-0000-4000-8000-000000000001'),
  10000.00::numeric,
  'finalize_purchase_receiving preserves HPP base cost_price (10000)'
);
select is(
  (select new_tax_rate from public.purchase_invoice_receipts where invoice_id = 'd7500000-0000-4000-8000-000000000001'),
  11.00::numeric,
  'purchase_invoice_receipts records supplier purchase tax rate'
);

-- 3. Defense-in-depth: even if product flag is forced is_taxable=true & tax_rate=11,
-- checkout_transaction / checkout_transaction_idempotent charges 0 sales tax across all payment methods
update public.products
set is_taxable = true, tax_rate = 11
where id = 'd7300000-0000-4000-8000-000000000001';

-- 3a. Cash checkout (2 * 15000 = 30000, cash received = 50000)
create temporary table cash_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'cash',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  50000,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select is((select (data->>'tax_amount')::numeric from cash_res), 0::numeric, 'cash RPC returns tax_amount = 0 even when is_taxable=true');
select is((select (data->>'total_amount')::numeric from cash_res), 30000::numeric, 'cash RPC returns total_amount equal to subtotal (30000)');
select is((select (data->>'cash_change')::numeric from cash_res), 20000::numeric, 'cash RPC returns exact cash_change (20000)');
select ok(
  (select tax_amount = 0 and subtotal = 30000 and total_amount = 30000 and cash_change = 20000
   from public.transactions where id = (select (data->>'transaction_id')::uuid from cash_res)),
  'cash transaction row persists zero tax and exact total/change'
);
select ok(
  (select tax_rate_snapshot = 0 and tax_amount = 0 and subtotal = 30000 and total_amount = 30000
   from public.transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from cash_res)),
  'cash transaction_items row persists tax_rate_snapshot = 0 and tax_amount = 0'
);

-- Exact cash tender (would fail INSUFFICIENT_CASH if tax were added)
select lives_ok($$
  select public.checkout_transaction_idempotent(
    'd7900000-0000-4000-8000-000000000002',
    'd7000000-0000-4000-8000-000000000002',
    'cash',
    '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
    30000,
    '{"prescription_category":"bebas"}'::jsonb,
    null
  )
$$, 'exact tender cash checkout succeeds without tax');

-- Idempotent replay on cash checkout
create temporary table cash_replay as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'cash',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  50000,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select (r.data->>'transaction_id') = (c.data->>'transaction_id') and (r.data->>'tax_amount')::numeric = 0
   from cash_replay r, cash_res c),
  'idempotent cash checkout replay preserves transaction_id and tax_amount = 0'
);

-- 3b. QRIS checkout & confirm
create temporary table qris_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000003',
  'd7000000-0000-4000-8000-000000000002',
  'qris',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select status = 'completed' and tax_amount = 0 and subtotal = 15000 and total_amount = 15000
      and cash_received is null and cash_change is null and payment_confirmed_at is not null
   from public.transactions where id = (select (data->>'transaction_id')::uuid from qris_res)),
  'QRIS checkout settles immediately as completed with tax_amount = 0'
);
select ok(
  (select tax_rate_snapshot = 0 and tax_amount = 0 and total_amount = 15000
   from public.transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from qris_res)),
  'QRIS transaction_items persists tax_rate_snapshot = 0 and tax_amount = 0'
);

select throws_ok(format(
  'select public.confirm_qris_payment(%L, %L)',
  (select (data->>'transaction_id')::uuid from qris_res),
  'd7000000-0000-4000-8000-000000000001'
), 'P0001', 'QRIS_ALREADY_CONFIRMED', 'instant completed QRIS rejects repeat manual confirmation');

-- 3c. Bank transfer checkout settles immediately without tax
create temporary table bank_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000004',
  'd7000000-0000-4000-8000-000000000002',
  'bank_transfer',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  null,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select ok(
  (select status = 'completed' and tax_amount = 0 and total_amount = 15000 and payment_confirmed_at is not null
   from public.transactions where id = (select (data->>'transaction_id')::uuid from bank_res)),
  'bank_transfer completes immediately with tax_amount = 0 and total_amount = 15000'
);

-- 3d. Void zero-tax cash checkout restores stock cleanly
create temporary table void_qris_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000005',
  'd7000000-0000-4000-8000-000000000002',
  'cash',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  15000,
  '{"prescription_category":"bebas"}'::jsonb,
  null
) data;

select lives_ok(format(
  'select public.void_transaction(%L, %L, %L)',
  (select (data->>'transaction_id')::uuid from void_qris_res),
  'd7000000-0000-4000-8000-000000000001',
  'batal cash zero tax'
), 'voiding zero-tax cash sale succeeds');

-- 3e. BPJS checkout with cart item + susulan item
create temporary table bpjs_mix_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000006',
  'd7000000-0000-4000-8000-000000000002',
  'bpjs',
  '[{"product_unit_id":"d7400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"BPJS-NOTAX-01","patient_name":"Pasien NoTax","prescription_origin":"RSUD"}'::jsonb,
  '[{"drug_name":"BPJS SUSULAN TEST","quantity":2,"unit_price":10000}]'::jsonb
) data;

select ok(
  (select tax_amount = 0 and subtotal = 35000 and total_amount = 35000
   from public.transactions where id = (select (data->>'transaction_id')::uuid from bpjs_mix_res)),
  'BPJS cart + susulan checkout persists tax_amount = 0 and combined total 35000'
);

-- 3f. BPJS empty-cart checkout with susulan item only
create temporary table bpjs_empty_res as
select public.checkout_transaction_idempotent(
  'd7900000-0000-4000-8000-000000000007',
  'd7000000-0000-4000-8000-000000000002',
  'bpjs',
  '[]'::jsonb,
  0,
  '{"prescription_category":"bpjs","bpjs_number":"BPJS-NOTAX-02","patient_name":"Pasien Empty","prescription_origin":"RSUD"}'::jsonb,
  '[{"drug_name":"BPJS EMPTY SUSULAN","quantity":1,"unit_price":12000}]'::jsonb
) data;

select ok(
  (select tax_amount = 0 and subtotal = 12000 and total_amount = 12000
   from public.transactions where id = (select (data->>'transaction_id')::uuid from bpjs_empty_res)),
  'BPJS empty-cart susulan checkout persists tax_amount = 0 and total 12000'
);

-- 4. Customer return request + admin approval on zero-tax cash transaction
create temporary table cash_tx_item as
select id from public.transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from cash_res) limit 1;

create temporary table ret_req as
select public.request_customer_return(
  'd7000000-0000-4000-8000-000000000002',
  (select (data->>'transaction_id')::uuid from cash_res),
  'cash',
  'Uji retur transaksi tanpa pajak',
  jsonb_build_array(jsonb_build_object('transaction_item_id', (select id from cash_tx_item), 'quantity_in_base', 1))
) data;

select ok(
  (select (data->>'refund_tax_amount')::numeric = 0 and (data->>'refund_total')::numeric = 15000 from ret_req),
  'customer return request on zero-tax sale yields refund_tax_amount = 0 and refund_total = 15000'
);

create temporary table stock_before_approve as
select quantity from public.product_batches
where product_id = 'd7300000-0000-4000-8000-000000000001' and batch_number = 'TAX-BATCH-01';

create temporary table ret_app as
select public.approve_customer_return(
  'd7000000-0000-4000-8000-000000000001',
  (select (data->>'return_id')::uuid from ret_req),
  'Disetujui tanpa pajak retur'
) data;

select ok(
  (select status = 'approved' and refund_status = 'completed' and refund_tax_amount = 0 and refund_total = 15000
   from public.returns where id = (select (data->>'return_id')::uuid from ret_req)),
  'customer return approval preserves zero tax and exact refund_total = 15000'
);
select is(
  (select quantity from public.product_batches where product_id = 'd7300000-0000-4000-8000-000000000001' and batch_number = 'TAX-BATCH-01'),
  (select quantity + 1 from stock_before_approve),
  'customer return approval restores batch stock by returned quantity'
);

-- 5. RPC execute grants remain locked down to service_role only
select ok(
  not exists(
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('checkout_transaction', 'finalize_purchase_receiving')
      and has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'anon cannot execute checkout_transaction or finalize_purchase_receiving'
);
select ok(
  not exists(
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('checkout_transaction', 'finalize_purchase_receiving')
      and has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  'authenticated cannot execute checkout_transaction or finalize_purchase_receiving'
);
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('checkout_transaction', 'finalize_purchase_receiving')
     and has_function_privilege('service_role', oid, 'EXECUTE')),
  2,
  'service_role can execute both updated RPCs'
);

select * from finish();
rollback;

