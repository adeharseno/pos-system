begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(5);

insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('a5500000-0000-4000-8000-000000000001','IDEMPOTENT','Idempotent checkout','TAB',true,false);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000001','TAB',1,1000,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('a5500000-0000-4000-8000-000000000003','a5500000-0000-4000-8000-000000000001','OPENING','2035-01-01',5,500);
insert into employees(id,full_name,position)
values('a5500000-0000-4000-8000-000000000004','Idempotent cashier','kasir');

create temporary table first_result as select checkout_transaction_idempotent(
  'a5500000-0000-4000-8000-000000000005',
  'a5500000-0000-4000-8000-000000000004','cash',
  '[{"product_unit_id":"a5500000-0000-4000-8000-000000000002","quantity":2}]',2000,
  '{"prescription_category":"bebas"}'
) data;
create temporary table replay_result as select checkout_transaction_idempotent(
  'a5500000-0000-4000-8000-000000000005',
  'a5500000-0000-4000-8000-000000000004','cash',
  '[{"product_unit_id":"a5500000-0000-4000-8000-000000000002","quantity":2}]',2000,
  '{"prescription_category":"bebas"}'
) data;

select is((select data->>'transaction_id' from replay_result),(select data->>'transaction_id' from first_result),'replay returns the original transaction');
select is((select count(*) from transactions where id=(select (data->>'transaction_id')::uuid from first_result)),1::bigint,'one transaction is created');
select is((select count(*) from checkout_requests where request_id='a5500000-0000-4000-8000-000000000005'),1::bigint,'one idempotency record is created');
select is((select quantity from product_batches where id='a5500000-0000-4000-8000-000000000003'),3,'stock is deducted once');
select throws_ok($$select checkout_transaction_idempotent(
  'a5500000-0000-4000-8000-000000000005',
  'a5500000-0000-4000-8000-000000000004','cash',
  '[{"product_unit_id":"a5500000-0000-4000-8000-000000000002","quantity":1}]',2000,
  '{"prescription_category":"bebas"}'
)$$,'P0001','CHECKOUT_REQUEST_CONFLICT','same key cannot be reused with another payload');

select * from finish();
rollback;
