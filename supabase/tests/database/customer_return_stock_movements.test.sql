begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(11);

insert into categories(id,name) values('af100000-0000-4000-8000-000000000001','Customer return movement');
insert into products(id,sku,name,base_unit,category_id) values
('af300000-0000-4000-8000-000000000001','RETURN-STEP5C2','Return movement product','Tablet','af100000-0000-4000-8000-000000000001');
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('af400000-0000-4000-8000-000000000001','af300000-0000-4000-8000-000000000001','Tablet',1,100,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at) values
('af500000-0000-4000-8000-000000000001','af300000-0000-4000-8000-000000000001','RETURN-A','2030-01-01',3,50,'2026-01-01'),
('af500000-0000-4000-8000-000000000002','af300000-0000-4000-8000-000000000001','RETURN-B','2030-02-01',10,50,'2026-01-02');
insert into employees(id,full_name,position) values('af600000-0000-4000-8000-000000000001','Petugas Retur','kasir');
create temporary table return_state(key text primary key,id uuid);
insert into return_state values('transaction',(public.checkout_transaction(
  'af600000-0000-4000-8000-000000000001','cash',
  '[{"product_unit_id":"af400000-0000-4000-8000-000000000001","quantity":5}]',500,null)->>'transaction_id')::uuid);
insert into return_state select 'item',id from transaction_items where transaction_id=(select id from return_state where key='transaction');

-- Partial return restores one unit from the first original allocation.
insert into return_state values('partial_return',(public.create_customer_return(
  'af600000-0000-4000-8000-000000000001',(select id from return_state where key='transaction'),'cash','Retur sebagian',
  jsonb_build_array(jsonb_build_object('transaction_item_id',(select id from return_state where key='item'),'quantity_in_base',1)))->>'return_id')::uuid);
-- The remaining full return spans the remainder of batch A and batch B.
insert into return_state values('final_return',(public.create_customer_return(
  'af600000-0000-4000-8000-000000000001',(select id from return_state where key='transaction'),'cash','Retur sisa',
  jsonb_build_array(jsonb_build_object('transaction_item_id',(select id from return_state where key='item'),'quantity_in_base',4)))->>'return_id')::uuid);

create temporary table customer_return_result as
select product_stock_movement_read_model('af300000-0000-4000-8000-000000000001',1,100) data;
create temporary table customer_return_rows as
select value from jsonb_array_elements((select data->'rows' from customer_return_result)) where value->>'type'='customer_return';

select is((select count(*) from customer_return_rows),3::bigint,'partial plus multi-batch final return creates three actual batch events');
select is((select sum((value->>'quantity')::integer) from customer_return_rows),5::bigint,'returned event quantity equals stock actually restored');
select is((select count(*) from customer_return_rows where (value->>'quantity')::integer=1),1::bigint,'partial return records only its restored quantity');
select is((select count(*) from customer_return_rows where (value->>'quantity')::integer=2),2::bigint,'full remainder is split across two actual batches');
select is((select count(distinct value->>'eventId') from customer_return_rows),3::bigint,'return allocation event IDs are unique');
select is((select count(*) from customer_return_rows where value->>'eventId' like 'customer-return:%'),3::bigint,'each event is sourced from a return batch allocation');
select is((select count(distinct value->>'referenceUrl') from customer_return_rows),1::bigint,'all partial and multi-batch events link to the original transaction');
select is((select value->>'employeeName' from customer_return_rows limit 1),'Petugas Retur','return event exposes processing employee');
select is((select count(*) from customer_return_rows r join return_item_batches rib on r.value->>'eventId'='customer-return:'||rib.id::text where (r.value->>'occurredAt')::timestamptz=rib.created_at),3::bigint,'event timestamp comes from actual batch restoration row');
select is((select count(*) from customer_return_rows r join transactions t on r.value->>'referenceNumber'=t.invoice_number where t.id=(select id from return_state where key='transaction')),3::bigint,'return events use original sale reference');
select is((product_stock_movement_read_model('af300000-0000-4000-8000-000000000001',1,100,'customer_return',null,null)->>'total')::integer,3,'customer return filter counts only restored allocations');
select * from finish();
rollback;
