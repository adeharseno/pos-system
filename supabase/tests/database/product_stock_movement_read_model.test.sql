begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(18);

insert into categories(id,name) values('ad100000-0000-4000-8000-000000000001','Movement category');
insert into products(id,sku,name,base_unit,category_id,minimum_stock) values
('ad300000-0000-4000-8000-000000000001','MOVEMENT-STEP5A','Movement product','Tablet','ad100000-0000-4000-8000-000000000001',5);
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('ad400000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','Strip',10,10000,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values
('ad500000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','MOVEMENT-BATCH','2030-01-01',100,500);
insert into employees(id,full_name,position) values
('ad600000-0000-4000-8000-000000000001','Kasir Movement','kasir'),
('ad600000-0000-4000-8000-000000000002','Owner Movement','owner_admin');
insert into suppliers(id,name) values('ad700000-0000-4000-8000-000000000001','Supplier Movement');

select public.checkout_transaction('ad600000-0000-4000-8000-000000000001','cash',
  '[{"product_unit_id":"ad400000-0000-4000-8000-000000000001","quantity":2}]',20000,null);
update transaction_item_batches set created_at='2026-11-06 10:00:00+07'
where product_id='ad300000-0000-4000-8000-000000000001';

insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,status,created_by,updated_by,completed_at,completed_by,finalization_snapshot)
values('ad800000-0000-4000-8000-000000000001','ad700000-0000-4000-8000-000000000001','SUP-MOVEMENT-001','2026-11-05',12000,'completed','ad600000-0000-4000-8000-000000000002','ad600000-0000-4000-8000-000000000002','2026-11-05 09:00:00+07','ad600000-0000-4000-8000-000000000002','{}');
insert into purchase_invoice_items(id,invoice_id,product_id,product_unit_id,product_name_snapshot,sku_snapshot,base_unit_snapshot,unit_name_snapshot,conversion_to_base,cost_price,tax_rate,selling_price,pricing_mode,quantity,batch_number,expired_date,created_by,updated_by)
values('ad900000-0000-4000-8000-000000000001','ad800000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','ad400000-0000-4000-8000-000000000001','Movement product','MOVEMENT-STEP5A','Tablet','Strip',10,6000,0,10000,'selling_price',2,'MOVEMENT-BATCH','2030-01-01','ad600000-0000-4000-8000-000000000002','ad600000-0000-4000-8000-000000000002');
insert into purchase_invoice_receipts(item_id,invoice_id,product_id,product_unit_id,batch_id,quantity_base,cost_price_base,previous_cost_price,new_cost_price,previous_selling_price,new_selling_price,previous_tax_rate,new_tax_rate,created_base_unit,received_at)
values('ad900000-0000-4000-8000-000000000001','ad800000-0000-4000-8000-000000000001','ad300000-0000-4000-8000-000000000001','ad400000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001',20,600,500,600,10000,10000,0,0,false,'2026-11-05 09:00:00+07');

create temporary table movement_result as
select product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',1,20) data;
select is(((select data from movement_result)->>'total')::integer,2,'one sale allocation and one receipt returned');
select is((select value->>'type' from jsonb_array_elements((select data->'rows' from movement_result)) with ordinality r(value,n) where n=1),'out','newest event sorts first');
select is((select (value->>'quantity')::integer from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='out'),20,'sale quantity comes from batch allocation in base units');
select is((select (value->>'quantity')::integer from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='in'),20,'receipt quantity comes from finalized receiving row');
select is((select value->>'unit' from jsonb_array_elements((select data->'rows' from movement_result)) limit 1),'Tablet','movement uses product base unit');
select is((select value->>'employeeName' from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='out'),'Kasir Movement','sale exposes cashier');
select is((select value->>'employeeName' from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='in'),'Owner Movement','receipt exposes receiving employee');
select is((select value->>'supplierName' from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='in'),'Supplier Movement','receipt exposes supplier');
select is((select value->>'referenceNumber' from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='in'),'SUP-MOVEMENT-001','receipt uses invoice reference');
select ok((select value->>'referenceUrl' from jsonb_array_elements((select data->'rows' from movement_result)) where value->>'type'='out') like '/transactions/%','sale links to transaction detail');
select is(jsonb_array_length(product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',2,1)->'rows'),1,'pagination is database-side');
select is((product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',99,1)->>'total')::integer,2,'empty page preserves total');
select ok(not has_function_privilege('authenticated','product_stock_movement_read_model(uuid,integer,integer)','EXECUTE'),'browser cannot call movement RPC');
select is((product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',1,20,'sale',null,null)->>'total')::integer,1,'sale filter is applied before total count');
select is((product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',1,20,'invoice',null,null)->>'total')::integer,1,'invoice filter is applied before total count');
select is((product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',1,20,null,'2026-11-05','2026-11-05')->>'total')::integer,1,'inclusive WIB date selects invoice day');
select is((product_stock_movement_read_model('ad300000-0000-4000-8000-000000000001',1,20,null,'2026-11-06','2026-11-06')->>'total')::integer,1,'inclusive WIB date selects sale day');
select ok(not has_function_privilege('authenticated','product_stock_movement_read_model(uuid,integer,integer,text,date,date)','EXECUTE'),'browser cannot call filtered movement RPC');
select * from finish();
rollback;
