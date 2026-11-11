begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.categories(id,name) values ('ca000000-0000-0000-0000-000000000001','Log cat');
insert into public.subcategories(id,name) values ('ca000000-0000-0000-0000-000000000002','Log sub');
insert into public.products(id,sku,name,category_id,subcategory_id,base_unit) values
  ('ca000000-0000-0000-0000-000000000003','LOG-PROD','Log product','ca000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000002','tablet');
insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
  ('ca000000-0000-0000-0000-000000000004','ca000000-0000-0000-0000-000000000003','tablet',1,100,true);
insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price) values
  ('ca000000-0000-0000-0000-000000000003','LOG-BATCH','2099-01-01',100,50);
insert into public.employees(id,full_name,position) values
  ('ca000000-0000-0000-0000-000000000005','Log cashier','kasir'),
  ('ca000000-0000-0000-0000-000000000006','Log owner','owner_admin');

create temporary table log_state(key text primary key, id uuid);

-- Checkout works without any drawer.
select lives_ok($$
  select public.checkout_transaction('ca000000-0000-0000-0000-000000000005','cash',
    '[{"product_unit_id":"ca000000-0000-0000-0000-000000000004","quantity":2}]',200,null)
$$, 'checkout works without a drawer');

insert into log_state values ('cash_tx', (
  select id from public.transactions
  where cashier_id='ca000000-0000-0000-0000-000000000005' and payment_method='cash' and status='completed'
  order by created_at desc limit 1));

select is((select status::text from public.transactions where id=(select id from log_state where key='cash_tx')),'completed','cash checkout completes');
select is((select total_amount from public.transactions where id=(select id from log_state where key='cash_tx')),200::numeric,'sale records totals');
select is((select unit_price from public.transaction_items where transaction_id=(select id from log_state where key='cash_tx')),100::numeric,'sale records unit price snapshot');
select is((select discount_amount from public.transaction_items where transaction_id=(select id from log_state where key='cash_tx')),0::numeric,'sale records discount snapshot');

-- Snapshot price is immutable after a later product price edit.
update public.product_units set selling_price=999 where id='ca000000-0000-0000-0000-000000000004';
select is((select unit_price from public.transaction_items where transaction_id=(select id from log_state where key='cash_tx')),100::numeric,'price edit does not change historical snapshot');

-- Cash refund works without a drawer.
insert into log_state values ('cash_item', (
  select id from public.transaction_items where transaction_id=(select id from log_state where key='cash_tx')));

select lives_ok(format($$
  select public.create_customer_return('ca000000-0000-0000-0000-000000000005',%L,'cash','refund',jsonb_build_array(jsonb_build_object('transaction_item_id',%L,'quantity_in_base',1)))
$$, (select id from log_state where key='cash_tx'), (select id from log_state where key='cash_item')),
  'cash refund works without a drawer');
select is((select count(*)::integer from public.return_items where transaction_item_id=(select id from log_state where key='cash_item')),1,'cash refund records an item');

-- Daily totals per cashier per payment method.
select is((select sale_count from public.daily_sales_totals where cashier_id='ca000000-0000-0000-0000-000000000005' and payment_method='cash'),1,'daily totals count cash sales');
select is((select completed_total from public.daily_sales_totals where cashier_id='ca000000-0000-0000-0000-000000000005' and payment_method='cash'),200::numeric,'daily totals sum completed sales');

-- Voided sales are split into the voided bucket, not completed.
insert into log_state values ('void_cash_tx', (
  public.checkout_transaction('ca000000-0000-0000-0000-000000000005','cash',
    '[{"product_unit_id":"ca000000-0000-0000-0000-000000000004","quantity":1}]',999,null)->>'transaction_id')::uuid);
select lives_ok(format($$select public.void_transaction(%L,'ca000000-0000-0000-0000-000000000005','abandoned')$$,(select id from log_state where key='void_cash_tx')),'void works without a drawer');
select is((select voided_total from public.daily_sales_totals where cashier_id='ca000000-0000-0000-0000-000000000005' and payment_method='cash'),999::numeric,'voided total tracked separately');

select * from finish();
rollback;
