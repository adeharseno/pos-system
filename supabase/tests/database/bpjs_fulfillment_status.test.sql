begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(9);

-- 1. Setup Master Data
insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('c6100000-0000-4000-8000-000000000001','BPJS-DRUG-1','Obat BPJS 1','TAB',true,false);

insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values('c6100000-0000-4000-8000-000000000002','c6100000-0000-4000-8000-000000000001','TAB',1,1000,true);

insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('c6100000-0000-4000-8000-000000000003','c6100000-0000-4000-8000-000000000001','B-BPJS-01','2035-01-01',100,500);

insert into employees(id,full_name,position)
values('c6100000-0000-4000-8000-000000000004','BPJS Admin','owner_admin');

-- 2. Test BPJS Transaction without susulan (all items handed over at checkout)
create temporary table tx_no_susulan as select checkout_transaction_idempotent(
  'c6100000-0000-4000-8000-000000000010',
  'c6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"c6100000-0000-4000-8000-000000000002","quantity":2}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000111","prescription_number":"RX-111"}'
) data;

select is(
  (select status from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_no_susulan)),
  'completed',
  'BPJS without susulan items shows completed (Selesai)'
);
select is(
  (select financial_status::text from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_no_susulan)),
  'completed',
  'Financial status is completed'
);

-- 3. Test BPJS Transaction with 2 susulan items
create temporary table tx_with_susulan as select checkout_transaction_idempotent(
  'c6100000-0000-4000-8000-000000000020',
  'c6100000-0000-4000-8000-000000000004',
  'bpjs',
  '[{"product_unit_id":"c6100000-0000-4000-8000-000000000002","quantity":2}]',
  0,
  '{"prescription_category":"bpjs","bpjs_number":"000222","prescription_number":"RX-222"}',
  '[{"drug_name":"Obat Susulan A","quantity":5,"unit_price":1000},{"drug_name":"Obat Susulan B","quantity":3,"unit_price":2000}]'
) data;

select is(
  (select status from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_with_susulan)),
  'incomplete_fulfillment',
  'BPJS with pending susulan items shows incomplete_fulfillment (Barang Belum Lengkap)'
);

-- 4. Fulfill 1 out of 2 susulan items (Partial fulfillment / penyerahan sebagian quantity)
select fulfill_bpjs_susulan_item(
  (select id from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from tx_with_susulan) and drug_name = 'Obat Susulan A'),
  'c6100000-0000-4000-8000-000000000004',
  null
);

select is(
  (select status from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_with_susulan)),
  'incomplete_fulfillment',
  'After partial fulfillment (1 of 2 fulfilled), status remains incomplete_fulfillment'
);

-- 5. Fulfill the remaining susulan item (Last item handed over)
select fulfill_bpjs_susulan_item(
  (select id from bpjs_susulan_items where transaction_id = (select (data->>'transaction_id')::uuid from tx_with_susulan) and drug_name = 'Obat Susulan B'),
  'c6100000-0000-4000-8000-000000000004',
  null
);

select is(
  (select status from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_with_susulan)),
  'completed',
  'After all susulan items are fulfilled, status automatically transitions to completed (Selesai)'
);
select is(
  (select financial_status::text from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_with_susulan)),
  'completed',
  'Financial status remains completed throughout fulfillment'
);

-- 6. Verify non-BPJS transaction (Cash) is unaffected
create temporary table tx_cash as select checkout_transaction_idempotent(
  'c6100000-0000-4000-8000-000000000030',
  'c6100000-0000-4000-8000-000000000004',
  'cash',
  '[{"product_unit_id":"c6100000-0000-4000-8000-000000000002","quantity":1}]',
  1000,
  '{"prescription_category":"bebas"}'
) data;

select is(
  (select status from transaction_history_view where id = (select (data->>'transaction_id')::uuid from tx_cash)),
  'completed',
  'Cash completed transaction shows completed'
);

-- 7. Verify filtering on transaction_history_view
select is(
  (select count(*) from transaction_history_view where status = 'completed'),
  (select count(*) from transaction_history_view where financial_status = 'completed' and status = 'completed'),
  'status filter completed matches only fully completed transactions'
);

select is(
  (select count(*) from transaction_history_view
   where id in (
     (select (data->>'transaction_id')::uuid from tx_no_susulan),
     (select (data->>'transaction_id')::uuid from tx_with_susulan),
     (select (data->>'transaction_id')::uuid from tx_cash)
   ) and status = 'incomplete_fulfillment'),
  0::bigint,
  'no incomplete test transactions remain after full fulfillment'
);

select * from finish();
rollback;
