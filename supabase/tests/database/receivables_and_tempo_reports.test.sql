begin;
select plan(41);

-- Setup employees, customer, product, units, batches
insert into public.categories(id, name)
values ('e1000000-0000-4000-8000-000000000001', 'Piutang Test Cat');
insert into public.subcategories(id, name)
values ('e1000000-0000-4000-8000-000000000002', 'Piutang Test Sub');
insert into public.products(id, sku, name, category_id, subcategory_id, base_unit, unit_confirmed, classification_pending)
values ('e1000000-0000-4000-8000-000000000003', 'PIUTANG-SKU-1', 'Obat Piutang Test', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'tablet', true, false);
insert into public.product_units(id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
values ('e1000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000003', 'tablet', 1, 10000, true);
insert into public.product_batches(id, product_id, batch_number, expired_date, quantity, cost_price)
values ('e1000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000003', 'BATCH-PIU-1', '2099-12-31', 100, 6000);

insert into public.employees(id, full_name, position, is_active) values
  ('e1000000-0000-4000-8000-000000000006', 'Owner Piutang', 'owner_admin', true),
  ('e1000000-0000-4000-8000-000000000007', 'Kasir Piutang', 'kasir', true);

insert into public.customers(id, name, phone, address, is_active, created_by)
values ('e1000000-0000-4000-8000-000000000008', 'Klinik Piutang Jaya', '081900000001', 'Jl. Pengujian No. 1', true, 'e1000000-0000-4000-8000-000000000006');

-- 1-4: Security, RLS & Append-Only Ledger Privileges
select ok(
  not has_function_privilege('anon', 'public.record_customer_receivable_payment(uuid,uuid,uuid,public.payment_method,numeric,date,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_customer_receivable_payment(uuid,uuid,uuid,public.payment_method,numeric,date,text,text)', 'execute'),
  'browser roles cannot execute record_customer_receivable_payment'
);
select ok(
  not has_function_privilege('anon', 'public.list_customer_receivables(uuid,date,text,date,date,text,text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_customer_receivables(uuid,date,text,date,date,text,text,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_customer_receivable_detail(uuid,uuid,date)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_customer_receivable_detail(uuid,uuid,date)', 'execute'),
  'browser roles cannot execute receivable listing or detail RPCs'
);
select ok(
  has_table_privilege('service_role', 'public.customer_receivable_payments', 'select')
  and has_table_privilege('service_role', 'public.customer_receivable_payments', 'insert')
  and not has_table_privilege('service_role', 'public.customer_receivable_payments', 'update')
  and not has_table_privilege('service_role', 'public.customer_receivable_payments', 'delete'),
  'customer_receivable_payments ledger is strictly append-only for service_role'
);
select throws_ok(
  $$select public.list_customer_receivables('e1000000-0000-4000-8000-000000000007', '2095-05-10')$$,
  'P0001', 'UNAUTHORIZED_ADMIN', 'kasir is blocked from list_customer_receivables'
);

-- Baseline summary snapshot before adding test fixtures
create temporary table baseline_summary as
select public.list_customer_receivables('e1000000-0000-4000-8000-000000000006', '2095-05-10')->'summary' as s;

-- Seed 3 TEMPO invoices on isolated future date 2095-05-10 via controlled test records (preserving batch/item accounting)
-- Rec 1: 100,000, due 2095-05-05 (OVERDUE vs 2095-05-10)
-- Rec 2: 200,000, due 2095-05-12 (DUE SOON <=3 days vs 2095-05-10)
-- Rec 3:  50,000, due 2095-05-20 (NOT DUE SOON vs 2095-05-10)
insert into public.transactions(id, invoice_number, business_date, cashier_id, customer_id, subtotal, tax_amount, total_amount, payment_method, status) values
  ('e1000000-0000-4000-8000-000000000101', 'RECVTEST-001', '2095-05-10', 'e1000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000008', 100000, 0, 100000, 'tempo', 'completed'),
  ('e1000000-0000-4000-8000-000000000102', 'RECVTEST-002', '2095-05-10', 'e1000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000008', 200000, 0, 200000, 'tempo', 'completed'),
  ('e1000000-0000-4000-8000-000000000103', 'RECVTEST-003', '2095-05-10', 'e1000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000008', 50000, 0, 50000, 'tempo', 'completed');

insert into public.transaction_items(id, transaction_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity_in_unit, conversion_to_base_snapshot, quantity_in_base, unit_price, tax_rate_snapshot, subtotal, tax_amount, total_amount) values
  ('e1000000-0000-4000-8000-000000000201', 'e1000000-0000-4000-8000-000000000101', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000004', 'Obat Piutang Test', 'tablet', 10, 1, 10, 10000, 0, 100000, 0, 100000),
  ('e1000000-0000-4000-8000-000000000202', 'e1000000-0000-4000-8000-000000000102', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000004', 'Obat Piutang Test', 'tablet', 20, 1, 20, 10000, 0, 200000, 0, 200000),
  ('e1000000-0000-4000-8000-000000000203', 'e1000000-0000-4000-8000-000000000103', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000004', 'Obat Piutang Test', 'tablet', 5, 1, 5, 10000, 0, 50000, 0, 50000);

insert into public.transaction_item_batches(transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values
  ('e1000000-0000-4000-8000-000000000201', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005', 10, 6000),
  ('e1000000-0000-4000-8000-000000000202', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005', 20, 6000),
  ('e1000000-0000-4000-8000-000000000203', 'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005', 5, 6000);

update public.product_batches set quantity = quantity - 35 where id = 'e1000000-0000-4000-8000-000000000005';

insert into public.customer_receivables(id, transaction_id, customer_id, original_amount, due_date, created_by) values
  ('e1000000-0000-4000-8000-000000000301', 'e1000000-0000-4000-8000-000000000101', 'e1000000-0000-4000-8000-000000000008', 100000, '2095-05-05', 'e1000000-0000-4000-8000-000000000007'),
  ('e1000000-0000-4000-8000-000000000302', 'e1000000-0000-4000-8000-000000000102', 'e1000000-0000-4000-8000-000000000008', 200000, '2095-05-12', 'e1000000-0000-4000-8000-000000000007'),
  ('e1000000-0000-4000-8000-000000000303', 'e1000000-0000-4000-8000-000000000103', 'e1000000-0000-4000-8000-000000000008', 50000, '2095-05-20', 'e1000000-0000-4000-8000-000000000007');

-- 5-7: Verify summary deltas, search, overdue filter, sorting & pagination
create temporary table cur_list as
select public.list_customer_receivables('e1000000-0000-4000-8000-000000000006', '2095-05-10', 'RECVTEST-', null, null, 'all', 'outstanding_amount', 'desc', 1, 2) as res;

select is(
  ((select res->'summary'->>'total_active_outstanding' from cur_list)::numeric - (select s->>'total_active_outstanding' from baseline_summary)::numeric),
  350000.00::numeric,
  'summary adds exact total_active_outstanding'
);
select is(
  ((select res->'summary'->>'due_soon_count' from cur_list)::bigint - (select s->>'due_soon_count' from baseline_summary)::bigint),
  1::bigint,
  'summary due_soon_count reflects invoices due within 3 days'
);
select is((select (res->>'total')::bigint from cur_list), 3::bigint, 'search filter matches 3 seeded receivables');
select is((select jsonb_array_length(res->'rows') from cur_list), 2, 'server-side pagination returns page size 2');
select is((select res#>>'{rows,0,invoice_number}' from cur_list), 'RECVTEST-002', 'server-side sort by outstanding_amount desc puts 200k first');

-- 10: Dynamic overdue status filter works
select is(
  (select public.list_customer_receivables('e1000000-0000-4000-8000-000000000006', '2095-05-10', 'RECVTEST-', null, null, 'overdue', 'due_date', 'asc', 1, 10)#>>'{rows,0,invoice_number}'),
  'RECVTEST-001',
  'dynamic overdue filter returns RECVTEST-001 on 2095-05-10'
);

-- 11-12: Accrual sales reports include TEMPO immediately while payment_refund_report stays 0 before payment
select is(
  public.sales_gross_profit_report('2095-05-10', '2095-05-10')->>'salesRevenue',
  '350000.00',
  'accrual sales_gross_profit_report recognizes TEMPO sales on business_date immediately'
);
select is(
  public.sales_gross_profit_report('2095-05-10', '2095-05-10')->>'cogs',
  '210000.00',
  'accrual COGS matches 35 x 6000 for TEMPO sales'
);
select is(
  public.profit_loss_report('2095-05-10', '2095-05-10')->>'grossProfit',
  '140000.00',
  'profit_loss_report reflects TEMPO accrual gross profit'
);
select is(
  public.dashboard_analytics_report('2095-05-10', '2095-05-10', 2095)#>>'{summary,salesRevenue}',
  '350000.00',
  'dashboard_analytics_report includes TEMPO accrual revenue on business_date'
);
select is(
  (select (x->>'paymentsReceived')::numeric from jsonb_array_elements(public.payment_refund_report('2095-05-10', '2095-05-10')->'methods') x where x->>'method' = 'cash'),
  0.00::numeric,
  'unpaid TEMPO sale does NOT count in payment_refund_report cash on sale date'
);

-- 16-20: Payment validation, authorization & idempotency
select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000301','cash',10000,'2095-05-11')$$,
  'P0001', 'UNAUTHORIZED_ADMIN', 'kasir cannot record receivable payment'
);
select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000301','cash',0,'2095-05-11')$$,
  'P0001', 'INVALID_PAYMENT_AMOUNT', 'zero payment rejected'
);
select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000301','tempo',10000,'2095-05-11')$$,
  'P0001', 'INVALID_PAYMENT_METHOD', 'tempo payment method rejected for settlement'
);
select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000301','cash',100001,'2095-05-11')$$,
  'P0001', 'RECEIVABLE_OVERPAYMENT', 'overpayment rejected'
);
select throws_ok(
  $$select public.get_customer_receivable_detail('e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000301','2095-05-10')$$,
  'P0001', 'UNAUTHORIZED_ADMIN', 'kasir cannot call get_customer_receivable_detail'
);

-- 21-25: Partial payment + Idempotent replay + Conflict + Full settlement + Cash/Accrual report check
create temporary table pay_1 as
select public.record_customer_receivable_payment(
  'e2000000-0000-4000-8000-000000000010',
  'e1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000301',
  'qris',
  40000,
  '2095-05-11',
  'QRIS-REF-01',
  'Cicilan 1'
) as res;

select is((select res->>'payment_status' from pay_1), 'partial', 'partial payment sets status to partial');
select is((select (res->>'outstanding_amount')::numeric from pay_1), 60000.00::numeric, 'outstanding drops to 60,000');

create temporary table pay_1_replay as
select public.record_customer_receivable_payment(
  'e2000000-0000-4000-8000-000000000010',
  'e1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000301',
  'qris',
  40000,
  '2095-05-11',
  'QRIS-REF-01',
  'Cicilan 1'
) as res;

select is((select (res->>'replayed')::boolean from pay_1_replay), true, 'exact same request_id replays safely');
select is((select count(*) from public.customer_receivable_payments where receivable_id = 'e1000000-0000-4000-8000-000000000301'), 1::bigint, 'replay creates no duplicate payment ledger row');

select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000301','qris',50000,'2095-05-11','QRIS-REF-01','Cicilan 1')$$,
  'P0001', 'RECEIVABLE_PAYMENT_REQUEST_CONFLICT', 'mismatched replay throws conflict'
);

-- Settle Rec 1 cleanly on 2095-05-15 via bank_transfer
create temporary table pay_2 as
select public.record_customer_receivable_payment(
  'e2000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000301',
  'bank_transfer',
  60000,
  '2095-05-15',
  'TRF-002',
  'Pelunasan'
) as res;

select is((select res->>'payment_status' from pay_2), 'paid', 'final payment sets status to paid');
select is((select (res->>'outstanding_amount')::numeric from pay_2), 0.00::numeric, 'outstanding becomes 0 after full payment');

select throws_ok(
  $$select public.record_customer_receivable_payment('e2000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000301','cash',1000,'2095-05-16')$$,
  'P0001', 'RECEIVABLE_ALREADY_PAID', 'payment on paid receivable is rejected'
);

-- 29-31: Report check on payment dates (cash-basis receipts vs zero double-count in sales revenue)
select is(
  (select x->>'paymentsReceived' from jsonb_array_elements(public.payment_refund_report('2095-05-11', '2095-05-11')->'methods') x where x->>'method' = 'qris'),
  '40000.00',
  'installment QRIS payment counted in payment_refund_report on payment_date'
);
select is(
  (select x->>'paymentsReceived' from jsonb_array_elements(public.payment_refund_report('2095-05-15', '2095-05-15')->'methods') x where x->>'method' = 'bank_transfer'),
  '60000.00',
  'final transfer settlement counted in payment_refund_report on payment_date'
);
select is(
  public.sales_gross_profit_report('2095-05-11', '2095-05-15')->>'salesRevenue',
  '0.00',
  'installment payment dates do NOT double count sales revenue'
);

-- 32-38: Tempo Return Opsi A (partial credit on Rec 2 + excess refund on Rec 3)
-- Rec 2: 200k unpaid -> request return of 5 tablets (50k) -> approve -> credit 50k, cash_refund 0, outstanding 150k, status stays unpaid!
create temporary table today_before as
select
  (clock_timestamp() at time zone 'Asia/Jakarta')::date as d,
  (select public.sales_gross_profit_report((clock_timestamp() at time zone 'Asia/Jakarta')::date, (clock_timestamp() at time zone 'Asia/Jakarta')::date)) as sgp,
  (select public.payment_refund_report((clock_timestamp() at time zone 'Asia/Jakarta')::date, (clock_timestamp() at time zone 'Asia/Jakarta')::date)) as prr;

select throws_ok(
  $$select public.request_customer_return('e1000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000102','tempo','Retur',jsonb_build_array(jsonb_build_object('transaction_item_id','e1000000-0000-4000-8000-000000000202','quantity_in_base',5)))$$,
  'P0001', 'INVALID_PAYMENT_METHOD', 'tempo transaction return cannot specify tempo as cash-excess refund_method'
);

create temporary table ret_rec2_req as
select public.request_customer_return(
  'e1000000-0000-4000-8000-000000000007',
  'e1000000-0000-4000-8000-000000000102',
  'cash',
  'Barang dikembalikan sebagian',
  jsonb_build_array(jsonb_build_object('transaction_item_id', 'e1000000-0000-4000-8000-000000000202', 'quantity_in_base', 5))
) as res;

create temporary table ret_rec2_app as
select public.approve_customer_return(
  'e1000000-0000-4000-8000-000000000006',
  (select (res->>'return_id')::uuid from ret_rec2_req),
  'Disetujui, kurangi piutang'
) as res;

select is((select (res->>'receivable_credit_amount')::numeric from ret_rec2_app), 50000.00::numeric, 'Rec 2 return credits 50,000 against receivable');
select is((select (res->>'cash_refund_amount')::numeric from ret_rec2_app), 0.00::numeric, 'Rec 2 return has 0 excess cash refund');
select is((select outstanding_amount from public.customer_receivables where id = 'e1000000-0000-4000-8000-000000000302'), 150000.00::numeric, 'Rec 2 outstanding reduced from 200,000 to 150,000');

select ok((select prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname = 'record_customer_receivable_payment'), 'record_customer_receivable_payment uses SECURITY DEFINER for audit insert');
select ok((select prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname = 'approve_customer_return'), 'approve_customer_return uses SECURITY DEFINER for audit insert');

-- Rec 3: 50k total -> pay 30k cash -> remaining 20k -> return full 5 tablets (50k) choosing bank_transfer -> 20k credit clears receivable, 30k excess cash refund!
set local role service_role;
select public.record_customer_receivable_payment(
  'e2000000-0000-4000-8000-000000000020',
  'e1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000303',
  'cash',
  30000,
  '2095-05-11'
);

create temporary table ret_rec3_req as
select public.request_customer_return(
  'e1000000-0000-4000-8000-000000000007',
  'e1000000-0000-4000-8000-000000000103',
  'bank_transfer',
  'Retur penuh setelah cicilan',
  jsonb_build_array(jsonb_build_object('transaction_item_id', 'e1000000-0000-4000-8000-000000000203', 'quantity_in_base', 5))
) as res;

create temporary table ret_rec3_app as
select public.approve_customer_return(
  'e1000000-0000-4000-8000-000000000006',
  (select (res->>'return_id')::uuid from ret_rec3_req),
  'Lunas piutang dan refund kelebihan via transfer'
) as res;
reset role;

select is((select (res->>'receivable_credit_amount')::numeric from ret_rec3_app), 20000.00::numeric, 'Rec 3 return credits only remaining 20,000');
select is((select (res->>'cash_refund_amount')::numeric from ret_rec3_app), 30000.00::numeric, 'Rec 3 return refunds 30,000 excess');
select is((select outstanding_amount || ':' || payment_status from public.customer_receivables where id = 'e1000000-0000-4000-8000-000000000303'), '0.00:paid', 'Rec 3 balance clamped at 0.00 and status set to paid');

-- Report delta check on return approval date: accrual refunds +100k, cash refund 0, bank_transfer refund +30k!
select is(
  ((select public.sales_gross_profit_report((select d from today_before), (select d from today_before))->>'refunds')::numeric
   - (select (sgp->>'refunds')::numeric from today_before))
  || '|' ||
  ((select (x->>'customerRefunds')::numeric from jsonb_array_elements(public.payment_refund_report((select d from today_before), (select d from today_before))->'methods') x where x->>'method' = 'cash')
   - (select (x->>'customerRefunds')::numeric from today_before, jsonb_array_elements(prr->'methods') x where x->>'method' = 'cash'))
  || '|' ||
  ((select (x->>'customerRefunds')::numeric from jsonb_array_elements(public.payment_refund_report((select d from today_before), (select d from today_before))->'methods') x where x->>'method' = 'bank_transfer')
   - (select (x->>'customerRefunds')::numeric from today_before, jsonb_array_elements(prr->'methods') x where x->>'method' = 'bank_transfer')),
  '100000.00|0.00|30000.00',
  'reports count full 100k accrual return and only 30k excess transfer refund with 0 cash outflow for unpaid credit'
);

select * from finish();
rollback;
