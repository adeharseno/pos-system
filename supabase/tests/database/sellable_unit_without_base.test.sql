begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(5);

insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('a5400000-0000-4000-8000-000000000001','NO-BASE','Sellable without base label',null,false,false);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values
  ('a5400000-0000-4000-8000-000000000002','a5400000-0000-4000-8000-000000000001','',1,58000,false),
  ('a5400000-0000-4000-8000-000000000003','a5400000-0000-4000-8000-000000000001','Unpriced',1,0,false);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
values('a5400000-0000-4000-8000-000000000004','a5400000-0000-4000-8000-000000000001','SAFE','2035-01-01',2,50000);
insert into employees(id,full_name,position) values('a5400000-0000-4000-8000-000000000005','Cashier unit fallback','kasir');

create temporary table valid_sale as select checkout_transaction(
  'a5400000-0000-4000-8000-000000000005','cash',
  '[{"product_unit_id":"a5400000-0000-4000-8000-000000000002","quantity":1}]',60000,null
) data;
select is((select data->>'total_amount' from valid_sale),'58000.00','valid selling price is authoritative without base label');
select is((select data->>'cash_change' from valid_sale),'2000.00','cash change remains authoritative');
select is((select quantity from product_batches where id='a5400000-0000-4000-8000-000000000004'),1,'conversion one deducts one base stock');
select is((select unit_name_snapshot from transaction_items ti join valid_sale s on ti.transaction_id=(s.data->>'transaction_id')::uuid),'','blank display label does not mix another product unit');
select throws_ok($$select checkout_transaction(
  'a5400000-0000-4000-8000-000000000005','cash',
  '[{"product_unit_id":"a5400000-0000-4000-8000-000000000003","quantity":1}]',100,null
)$$,'P0001','INVALID_SELLING_PRICE','zero-price unit cannot checkout');

select * from finish();
rollback;
