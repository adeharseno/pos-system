begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(11);

insert into categories(id,name) values('b0100000-0000-4000-8000-000000000001','Supplier return movement');
insert into products(id,sku,name,base_unit,category_id) values
('b0300000-0000-4000-8000-000000000001','SUPPLIER-RETURN-5C3','Supplier return product','Tablet','b0100000-0000-4000-8000-000000000001');
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('b0400000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','Tablet',1,100,true);
insert into employees(id,full_name,position) values('b0600000-0000-4000-8000-000000000001','Owner Retur Pemasok','owner_admin');
insert into suppliers(id,name) values('b0700000-0000-4000-8000-000000000001','Pemasok Asal Batch');
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by)
values('b0800000-0000-4000-8000-000000000001','b0700000-0000-4000-8000-000000000001','SOURCE-SUPPLIER-RETURN','2026-11-01',1000,'b0600000-0000-4000-8000-000000000001','b0600000-0000-4000-8000-000000000001');
insert into purchase_invoice_items(id,invoice_id,product_id,product_unit_id,product_name_snapshot,sku_snapshot,base_unit_snapshot,unit_name_snapshot,conversion_to_base,cost_price,tax_rate,selling_price,pricing_mode,quantity,batch_number,expired_date,created_by,updated_by) values
('b0900000-0000-4000-8000-000000000001','b0800000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0400000-0000-4000-8000-000000000001','Supplier return product','SUPPLIER-RETURN-5C3','Tablet','Tablet',1,50,0,100,'selling_price',10,'SUP-RET-A','2030-01-01','b0600000-0000-4000-8000-000000000001','b0600000-0000-4000-8000-000000000001'),
('b0900000-0000-4000-8000-000000000002','b0800000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0400000-0000-4000-8000-000000000001','Supplier return product','SUPPLIER-RETURN-5C3','Tablet','Tablet',1,50,0,100,'selling_price',10,'SUP-RET-B','2030-02-01','b0600000-0000-4000-8000-000000000001','b0600000-0000-4000-8000-000000000001');
insert into product_batches(id,product_id,purchase_invoice_item_id,batch_number,expired_date,quantity,cost_price) values
('b0500000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0900000-0000-4000-8000-000000000001','SUP-RET-A','2030-01-01',10,50),
('b0500000-0000-4000-8000-000000000002','b0300000-0000-4000-8000-000000000001','b0900000-0000-4000-8000-000000000002','SUP-RET-B','2030-02-01',10,50);

create temporary table supplier_return_state as select (create_supplier_return(
  'b0600000-0000-4000-8000-000000000001','Kemasan rusak',jsonb_build_array(
    jsonb_build_object('product_id','b0300000-0000-4000-8000-000000000001','batch_id','b0500000-0000-4000-8000-000000000001','quantity_in_base',2),
    jsonb_build_object('product_id','b0300000-0000-4000-8000-000000000001','batch_id','b0500000-0000-4000-8000-000000000002','quantity_in_base',3)
  ))->>'return_id') as return_id;
create temporary table supplier_return_rows as
select value from jsonb_array_elements(product_stock_movement_read_model('b0300000-0000-4000-8000-000000000001',1,100)->'rows')
where value->>'type'='supplier_return';

select is((select count(*) from supplier_return_rows),2::bigint,'multi-batch supplier return creates two actual allocation events');
select is((select sum((value->>'quantity')::integer) from supplier_return_rows),5::bigint,'event quantity equals stock actually deducted');
select is((select count(*) from supplier_return_rows where (value->>'quantity')::integer=2),1::bigint,'first partial batch quantity is retained');
select is((select count(*) from supplier_return_rows where (value->>'quantity')::integer=3),1::bigint,'second partial batch quantity is retained');
select is((select count(distinct value->>'eventId') from supplier_return_rows),2::bigint,'supplier return event IDs do not duplicate');
select is((select count(distinct value->>'referenceNumber') from supplier_return_rows),1::bigint,'multi-batch events share one return reference');
select is((select count(*) from supplier_return_rows where value->>'supplierName'='Pemasok Asal Batch'),2::bigint,'supplier is traced from each source batch when available');
select is((select value->>'employeeName' from supplier_return_rows limit 1),'Owner Retur Pemasok','processing employee is included');
select is((select count(*) from supplier_return_rows where value->'referenceUrl'='null'::jsonb),2::bigint,'supplier return has no invented detail link');
select is((select count(*) from supplier_return_rows r join return_item_batches rib on r.value->>'eventId'='supplier-return:'||rib.id::text where (r.value->>'occurredAt')::timestamptz=rib.created_at),2::bigint,'timestamp comes from actual batch deduction allocation');
select is((product_stock_movement_read_model('b0300000-0000-4000-8000-000000000001',1,100,'supplier_return',null,null)->>'total')::integer,2,'supplier return filter counts only deducted allocations');
select * from finish();
rollback;
