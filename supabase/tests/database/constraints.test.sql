begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(52);

-- Minimal deterministic fixtures. The enclosing transaction is rolled back.
insert into categories (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Test Category');

insert into subcategories (id, category_id, name) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test Subcategory');

insert into products (id, sku, name, category_id, subcategory_id, base_unit) values
  ('20000000-0000-0000-0000-000000000001', 'TEST-A', 'Product A', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'tablet'),
  ('20000000-0000-0000-0000-000000000002', 'TEST-B', 'Product B', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'tablet');

insert into product_units (id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Tablet A', 1, 100, true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Tablet B', 1, 200, true);

insert into product_batches (id, product_id, batch_number, expired_date, quantity, cost_price) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'BATCH-A', '2030-01-01', 100, 50),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'BATCH-B', '2030-01-01', 100, 75);

insert into employees (id, full_name, position) values
  ('50000000-0000-0000-0000-000000000001', 'Test Cashier', 'kasir'),
  ('50000000-0000-0000-0000-000000000002', 'Test Admin', 'owner_admin');

insert into cash_drawer_sessions (id, employee_id, opening_balance) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 100000);

-- Cash, QRIS, and transaction-item structure.
select lives_ok(
  $$insert into transactions (id, invoice_number, cashier_id, cash_drawer_session_id, subtotal, total_amount, payment_method, cash_received, cash_change, payment_confirmed_at, payment_confirmed_by, status) values ('70000000-0000-0000-0000-000000000001', 'TEST-CASH-VALID', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 100, 'cash', 200, 100, now(), '50000000-0000-0000-0000-000000000001', 'completed')$$,
  'valid cash lifecycle is accepted'
);

select lives_ok(
  $$insert into transactions (id, invoice_number, cashier_id, cash_drawer_session_id, subtotal, total_amount, payment_method, status) values ('70000000-0000-0000-0000-000000000002', 'TEST-QRIS-PENDING', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 100, 'qris', 'pending_payment')$$,
  'valid pending QRIS lifecycle is accepted'
);

select lives_ok(
  $$insert into transactions (id, invoice_number, cashier_id, cash_drawer_session_id, subtotal, total_amount, payment_method, payment_confirmed_at, payment_confirmed_by, status) values ('70000000-0000-0000-0000-000000000003', 'TEST-QRIS-COMPLETE', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 100, 'qris', now(), '50000000-0000-0000-0000-000000000001', 'completed')$$,
  'valid completed QRIS lifecycle is accepted'
);

select lives_ok(
  $$insert into transaction_items (id, transaction_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity_in_unit, conversion_to_base_snapshot, quantity_in_base, unit_price, subtotal, total_amount) values ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Product A', 'Tablet A', 1, 1, 1, 100, 100, 100)$$,
  'Product A with Unit A is accepted'
);

select throws_ok(
  $$insert into transaction_items (transaction_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity_in_unit, conversion_to_base_snapshot, quantity_in_base, unit_price, subtotal, total_amount) values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Product A', 'Tablet B', 1, 1, 1, 100, 100, 100)$$,
  23503
);

select lives_ok(
  $$insert into transaction_item_batches (id, transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 50)$$,
  'valid item and matching batch allocation is accepted'
);

select throws_ok(
  $$insert into transaction_item_batches (transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('80000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 50)$$,
  23503
);

select throws_ok(
  $$insert into transaction_item_batches (transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 1, 50)$$,
  23503
);

select throws_ok(
  $$insert into transaction_item_batches (transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 0, 50)$$,
  23514
);

select throws_ok(
  $$insert into transaction_item_batches (transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, -1)$$,
  23514
);

-- Return header, source item, and batch structure.
select lives_ok(
  $$insert into returns (id, source, transaction_id, refund_method, cash_drawer_session_id, reason, processed_by, refund_subtotal, refund_total) values ('90000000-0000-0000-0000-000000000001', 'customer', '70000000-0000-0000-0000-000000000001', 'cash', '60000000-0000-0000-0000-000000000001', 'Test return', '50000000-0000-0000-0000-000000000001', 100, 100)$$,
  'customer cash return with a valid refund drawer is accepted'
);

select throws_ok(
  $$insert into returns (source, transaction_id, refund_method, cash_drawer_session_id, reason, processed_by) values ('customer', '70000000-0000-0000-0000-000000000001', 'cash', '60000000-0000-0000-0000-000000000099', 'Bad drawer', '50000000-0000-0000-0000-000000000001')$$,
  23503
);

select throws_ok(
  $$insert into returns (source, transaction_id, refund_method, reason, processed_by) values ('customer', '70000000-0000-0000-0000-000000000001', 'cash', 'Missing drawer', '50000000-0000-0000-0000-000000000001')$$,
  23514
);

select throws_ok(
  $$insert into returns (source, cash_drawer_session_id, reason, processed_by) values ('supplier', '60000000-0000-0000-0000-000000000001', 'Invalid supplier drawer', '50000000-0000-0000-0000-000000000001')$$,
  23514
);

select lives_ok(
  $$insert into return_items (id, return_id, product_id, transaction_item_id, quantity_in_base, refund_subtotal, refund_total) values ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 1, 100, 100)$$,
  'return item matching its source transaction item is accepted'
);

select throws_ok(
  $$insert into return_items (return_id, product_id, transaction_item_id, quantity_in_base) values ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 1)$$,
  23503
);

select lives_ok(
  $$insert into return_item_batches (return_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('91000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 50)$$,
  'return allocation with matching product batch is accepted'
);

select throws_ok(
  $$insert into return_item_batches (return_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot) values ('91000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 1, 50)$$,
  23503
);

-- Stock opname structure only; operational freeze remains future RPC work.
select lives_ok(
  $$insert into stock_opname_sessions (id, status, created_by) values ('a0000000-0000-0000-0000-000000000001', 'in_progress', '50000000-0000-0000-0000-000000000002')$$,
  'valid in-progress stock opname is accepted'
);

select lives_ok(
  $$insert into stock_opname_items (session_id, product_id, batch_id, system_quantity, physical_quantity) values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 100, 99)$$,
  'stock opname item with matching product and batch is accepted'
);

select throws_ok(
  $$insert into stock_opname_items (session_id, product_id, batch_id, system_quantity) values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 100)$$,
  23503
);

select throws_ok(
  $$insert into stock_opname_items (session_id, product_id, batch_id, system_quantity) values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', -1)$$,
  23514
);

select throws_ok(
  $$insert into stock_opname_items (session_id, product_id, batch_id, system_quantity, physical_quantity) values ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 100, -1)$$,
  23514
);

select throws_ok(
  $$insert into stock_opname_sessions (status, created_by) values ('unknown', '50000000-0000-0000-0000-000000000002')$$,
  23514
);

select throws_ok(
  $$insert into stock_opname_sessions (status, created_by) values ('applied', '50000000-0000-0000-0000-000000000002')$$,
  23514
);

-- Invalid cash and QRIS lifecycle shapes.
select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, cash_received, cash_change, payment_confirmed_at, payment_confirmed_by, status) values ('TEST-CASH-PENDING', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'cash', 100, 0, now(), '50000000-0000-0000-0000-000000000001', 'pending_payment')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-CASH-NULL', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'cash', 'completed')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, cash_received, cash_change, payment_confirmed_at, payment_confirmed_by, status) values ('TEST-CASH-SHORT', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'cash', 99, 0, now(), '50000000-0000-0000-0000-000000000001', 'completed')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, cash_received, cash_change, payment_confirmed_at, payment_confirmed_by, status) values ('TEST-CASH-CHANGE', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'cash', 200, 99, now(), '50000000-0000-0000-0000-000000000001', 'completed')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, payment_confirmed_at, status) values ('TEST-QRIS-TIME', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', now(), 'pending_payment')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, payment_confirmed_by, status) values ('TEST-QRIS-ACTOR', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', '50000000-0000-0000-0000-000000000001', 'pending_payment')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-QRIS-COMPLETE-BAD', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'completed')$$,
  23514
);

-- Void metadata consistency.
select lives_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status, voided_at, voided_by, void_reason) values ('TEST-VOID-VALID', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'voided', now(), '50000000-0000-0000-0000-000000000001', 'Test void')$$,
  'voided transaction with complete metadata is accepted'
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-VOID-MISSING', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'voided')$$,
  23514
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status, voided_at, voided_by, void_reason) values ('TEST-NONVOID-METADATA', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'pending_payment', now(), '50000000-0000-0000-0000-000000000001', 'Should fail')$$,
  23514
);

-- Numeric, money, and inventory checks.
select throws_ok(
  $$insert into product_batches (product_id, batch_number, expired_date, quantity, cost_price) values ('20000000-0000-0000-0000-000000000001', 'NEG-QTY', '2030-01-01', -1, 1)$$,
  23514
);

select throws_ok(
  $$insert into product_batches (product_id, batch_number, expired_date, quantity, cost_price) values ('20000000-0000-0000-0000-000000000001', 'NEG-COST', '2030-01-01', 1, -1)$$,
  23514
);

select throws_ok(
  $$insert into product_units (product_id, unit_name, conversion_to_base, selling_price) values ('20000000-0000-0000-0000-000000000001', 'Invalid Conversion', 0, 1)$$,
  23514
);

select throws_ok(
  $$insert into product_units (product_id, unit_name, conversion_to_base, selling_price) values ('20000000-0000-0000-0000-000000000001', 'Negative Price', 1, -1)$$,
  23514
);

select throws_ok(
  $$insert into products (sku, name, category_id, subcategory_id, base_unit, tax_rate) values ('BAD-TAX', 'Bad Tax Product', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'tablet', 101)$$,
  23514
);

select throws_ok(
  $$insert into transaction_items (transaction_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity_in_unit, conversion_to_base_snapshot, quantity_in_base, unit_price, subtotal, total_amount) values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Product A', 'Tablet A', 0, 1, 1, 100, 100, 100)$$,
  23514
);

select throws_ok(
  $$insert into transaction_items (transaction_id, product_id, product_unit_id, product_name_snapshot, unit_name_snapshot, quantity_in_unit, conversion_to_base_snapshot, quantity_in_base, unit_price, subtotal, total_amount) values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Product A', 'Tablet A', 1, 1, 1, -1, 100, 100)$$,
  23514
);

-- Cash drawer and reference integrity.
select throws_ok(
  $$insert into cash_drawer_sessions (employee_id, opening_balance) values ('50000000-0000-0000-0000-000000000002', -1)$$,
  23514
);

select throws_ok(
  $$insert into cash_drawer_sessions (employee_id, opening_balance) values ('50000000-0000-0000-0000-000000000001', 0)$$,
  23505
);

select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-BAD-DRAWER', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000099', 100, 'qris', 'pending_payment')$$,
  23503
);

select throws_ok(
  $$insert into returns (source, transaction_id, refund_method, cash_drawer_session_id, reason, processed_by) values ('customer', '70000000-0000-0000-0000-000000000001', 'cash', '60000000-0000-0000-0000-000000000099', 'Bad drawer FK', '50000000-0000-0000-0000-000000000001')$$,
  23503
);

insert into cash_drawer_sessions (id, employee_id, opening_balance, closed_at)
values ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 0, now());

select is(
  (select is_open from cash_drawer_sessions where id = '60000000-0000-0000-0000-000000000002'),
  false,
  'closed_at structurally derives is_open=false'
);

-- RLS and privilege regression on a protected transactional table.
set local role anon;
select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-ANON', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'pending_payment')$$,
  42501
);
reset role;

set local role authenticated;
select throws_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-AUTH', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'pending_payment')$$,
  42501
);
reset role;

set local role service_role;
select lives_ok(
  $$insert into transactions (invoice_number, cashier_id, cash_drawer_session_id, total_amount, payment_method, status) values ('TEST-SERVICE-ROLE', '50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 100, 'qris', 'pending_payment')$$,
  'service_role can mutate a protected transactional table'
);
reset role;

select ok(
  has_table_privilege('service_role', 'transactions', 'INSERT'),
  'service_role has server-side insert privilege'
);

select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  'service_role bypasses RLS as the trusted server role'
);

select * from finish();
rollback;
