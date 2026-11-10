begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(19);

-- Setup Master Data
insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('c1000000-0000-4000-8000-000000000001','RET-PROD-1','OBAT TEST RETUR','TAB',true,false);

insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values('c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','TAB',1,10000,true);

insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','BATCH-RET-01','2035-01-01',50,6000);

insert into employees(id,full_name,position)
values
  ('c1000000-0000-4000-8000-000000000004','Cashier Retur','kasir'),
  ('c1000000-0000-4000-8000-000000000005','Admin Retur','owner_admin');

-- Create a normal completed cash sale (10 TAB @ 10,000 = 100,000)
-- Batch stock drops from 50 to 40.
create temporary table sale_res as select checkout_transaction_idempotent(
  'c1000000-0000-4000-8000-000000000010',
  'c1000000-0000-4000-8000-000000000004',
  'cash',
  '[{"product_unit_id":"c1000000-0000-4000-8000-000000000002","quantity":10}]',
  100000,
  '{"prescription_category":"bebas"}'::jsonb
) data;

select is((select quantity from product_batches where id = 'c1000000-0000-4000-8000-000000000003'), 40, 'initial sale deducted 10 items from batch');

-- 1. Kasir creates return request for 3 TAB
create temporary table tx_item_id as
select id from transaction_items where transaction_id = (select (data->>'transaction_id')::uuid from sale_res) limit 1;

create temporary table req_1 as select request_customer_return(
  'c1000000-0000-4000-8000-000000000004',
  (select (data->>'transaction_id')::uuid from sale_res),
  'cash',
  'Kemasan rusak saat sampai di rumah',
  jsonb_build_array(jsonb_build_object('transaction_item_id', (select id from tx_item_id), 'quantity_in_base', 3))
) data;

select is((select data->>'status' from req_1), 'pending_approval', 'request status is pending_approval');
select is((select (data->>'refund_total')::numeric from req_1), 30000::numeric, 'refund total is 30,000 for 3 items');

-- Check stock NOT changed after request
select is((select quantity from product_batches where id = 'c1000000-0000-4000-8000-000000000003'), 40, 'stock remains 40 after request');
select is((select count(*) from return_item_batches where return_item_id in (select id from return_items where return_id = (select (data->>'return_id')::uuid from req_1))), 0::bigint, 'zero return_item_batches created on request');

-- 2. Reject request without notes throws error
select throws_ok($$select reject_customer_return(
  'c1000000-0000-4000-8000-000000000005',
  (select (data->>'return_id')::uuid from req_1),
  '   '
)$$, 'P0001', 'ADMIN_NOTES_REQUIRED', 'reject without notes raises ADMIN_NOTES_REQUIRED');

-- Non-admin cannot reject
select throws_ok($$select reject_customer_return(
  'c1000000-0000-4000-8000-000000000004',
  (select (data->>'return_id')::uuid from req_1),
  'Bukan wewenang kasir'
)$$, 'P0001', 'UNAUTHORIZED_ADMIN', 'kasir cannot reject');

-- 3. Admin rejects request 1
create temporary table rej_1 as select reject_customer_return(
  'c1000000-0000-4000-8000-000000000005',
  (select (data->>'return_id')::uuid from req_1),
  'Foto barang tidak disertakan'
) data;

select is((select data->>'status' from rej_1), 'rejected', 'status changed to rejected');
select is((select admin_notes from returns where id = (select (data->>'return_id')::uuid from req_1)), 'Foto barang tidak disertakan', 'admin_notes saved correctly');
select is((select quantity from product_batches where id = 'c1000000-0000-4000-8000-000000000003'), 40, 'stock remains 40 after rejection');

-- 4. New request for 4 TAB (allowed because previous was rejected)
create temporary table req_2 as select request_customer_return(
  'c1000000-0000-4000-8000-000000000004',
  (select (data->>'transaction_id')::uuid from sale_res),
  'cash',
  'Salah beli obat dengan foto terlampir',
  jsonb_build_array(jsonb_build_object('transaction_item_id', (select id from tx_item_id), 'quantity_in_base', 4))
) data;

select is((select data->>'status' from req_2), 'pending_approval', 'second request submitted');

-- 5. Admin approves request 2 with separate refund confirmation (confirm_refund = false)
create temporary table app_2 as select approve_customer_return(
  'c1000000-0000-4000-8000-000000000005',
  (select (data->>'return_id')::uuid from req_2),
  'Disetujui. Silakan kembalikan fisik obat ke apotek.',
  null,
  false
) data;

select is((select data->>'status' from app_2), 'approved', 'status is approved');
select is((select data->>'refund_status' from app_2), 'pending', 'refund_status is pending');
select matches((select data->>'return_number' from app_2), '^RET-\d{8}-\d{4}$', 'sequential Nota Retur number generated');
select is((select quantity from product_batches where id = 'c1000000-0000-4000-8000-000000000003'), 40, 'stock still 40 while refund is pending');

-- 6. Complete return with 3 items good (restocked) and 1 item damaged (not restocked)
create temporary table ret_item_id as
select id from return_items where return_id = (select (data->>'return_id')::uuid from req_2) limit 1;

-- If marked 'good': quantity restocks 4 back to batch (40 + 4 = 44)
create temporary table comp_2 as select complete_customer_return(
  'c1000000-0000-4000-8000-000000000005',
  (select (data->>'return_id')::uuid from req_2),
  null
) data;

select is((select data->>'status' from comp_2), 'completed', 'status is completed');
select is((select data->>'refund_status' from comp_2), 'completed', 'refund_status is completed');
select is((select quantity from product_batches where id = 'c1000000-0000-4000-8000-000000000003'), 44, 'stock restored by 4 from 40 to 44');
select is((select count(*) from return_item_batches where return_item_id = (select id from ret_item_id)), 1::bigint, 'return_item_batches created for audit trail');

select * from finish();
rollback;
