begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(12);

-- 1. Setup Master Fixtures
insert into employees(id,full_name,position)
values('d6200000-0000-4000-8000-000000000001','Invoice Owner Admin','owner_admin');

insert into employees(id,full_name,position)
values('d6200000-0000-4000-8000-000000000002','Invoice Kasir','kasir');

insert into suppliers(id,name,phone,address,is_active)
values('d6200000-0000-4000-8000-000000000003','Supplier Test Delete','08123456789','Jl. Uji No. 1',true);

insert into products(id,sku,name,base_unit,unit_confirmed,classification_pending)
values('d6200000-0000-4000-8000-000000000004','SKU-DEL-1','Produk Uji Delete','TAB',true,false);

insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
values('d6200000-0000-4000-8000-000000000005','d6200000-0000-4000-8000-000000000004','TAB',1,1500,true);

-- 2. Test 1 & 2: Create and Safe Delete Draft Invoice without Dependencies
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,status,created_by,updated_by)
values('d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000003','INV-DRAFT-DEL','2026-11-09',50000,'draft','d6200000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001');

insert into purchase_invoice_items(id,invoice_id,product_id,product_unit_id,product_name_snapshot,sku_snapshot,base_unit_snapshot,unit_name_snapshot,conversion_to_base,cost_price,tax_rate,selling_price,pricing_mode,quantity,batch_number,created_by,updated_by)
values('d6200000-0000-4000-8000-000000000011','d6200000-0000-4000-8000-000000000010','d6200000-0000-4000-8000-000000000004','d6200000-0000-4000-8000-000000000005','Produk Uji Delete','SKU-DEL-1','TAB','TAB',1,1000,0,1500,'selling_price',50,'BATCH-DEL-01','d6200000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001');

insert into purchase_invoice_requests(request_id,invoice_id,payload,employee_id)
values('d6200000-0000-4000-8000-000000000012','d6200000-0000-4000-8000-000000000010','{"action":"draft"}'::jsonb,'d6200000-0000-4000-8000-000000000001');

-- Another unrelated invoice to ensure isolation
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,status,created_by,updated_by)
values('d6200000-0000-4000-8000-000000000099','d6200000-0000-4000-8000-000000000003','INV-OTHER-UNTOUCHED','2026-11-09',10000,'draft','d6200000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001');

create temporary table del_result as select delete_purchase_invoice(
  'd6200000-0000-4000-8000-000000000010',
  'd6200000-0000-4000-8000-000000000001'
) data;

select is((select (data->>'deleted')::boolean from del_result), true, 'delete draft returns deleted: true');
select is((select count(*) from purchase_invoices where id = 'd6200000-0000-4000-8000-000000000010'), 0::bigint, 'invoice row is deleted');
select is((select count(*) from purchase_invoice_items where invoice_id = 'd6200000-0000-4000-8000-000000000010'), 0::bigint, 'draft invoice items are deleted');
select is((select count(*) from purchase_invoice_requests where invoice_id = 'd6200000-0000-4000-8000-000000000010'), 0::bigint, 'idempotency requests are deleted');
select is((select count(*) from purchase_invoices where id = 'd6200000-0000-4000-8000-000000000099'), 1::bigint, 'unrelated invoice remains untouched');

-- 3. Test Double Delete / Non-Existent Invoice
select throws_ok($$select delete_purchase_invoice(
  'd6200000-0000-4000-8000-000000000010',
  'd6200000-0000-4000-8000-000000000001'
)$$, 'P0001', 'PURCHASE_INVOICE_NOT_FOUND', 're-deleting already deleted invoice throws not found (double submit safe)');

-- 4. Test 3: Reject Delete Invoice with Payments
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,status,created_by,updated_by)
values('d6200000-0000-4000-8000-000000000020','d6200000-0000-4000-8000-000000000003','INV-PAID-TEST','2026-11-09',50000,'draft','d6200000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001');

insert into purchase_invoice_payments(id,invoice_id,amount,payment_key,payment_date,recorded_by)
values('d6200000-0000-4000-8000-000000000021','d6200000-0000-4000-8000-000000000020',25000,'pay-1','2026-11-09','d6200000-0000-4000-8000-000000000001');

select throws_ok($$select delete_purchase_invoice(
  'd6200000-0000-4000-8000-000000000020',
  'd6200000-0000-4000-8000-000000000001'
)$$, 'P0001', 'INVOICE_HAS_PAYMENTS', 'rejects deletion when payment exists');

select is((select count(*) from purchase_invoices where id = 'd6200000-0000-4000-8000-000000000020'), 1::bigint, 'invoice with payments remains intact');
select is((select count(*) from purchase_invoice_payments where invoice_id = 'd6200000-0000-4000-8000-000000000020'), 1::bigint, 'payment records remain intact');

-- 5. Test 4 & 5: Reject Delete Completed Invoice (Received Stock / Batches)
insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,status,created_by,updated_by,completed_at,completed_by,finalization_snapshot)
values('d6200000-0000-4000-8000-000000000030','d6200000-0000-4000-8000-000000000003','INV-COMPLETED-TEST','2026-11-09',50000,'completed','d6200000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001',now(),'d6200000-0000-4000-8000-000000000001','{"done":true}'::jsonb);

select throws_ok($$select delete_purchase_invoice(
  'd6200000-0000-4000-8000-000000000030',
  'd6200000-0000-4000-8000-000000000001'
)$$, 'P0001', 'INVOICE_ALREADY_RECEIVED', 'rejects deletion when invoice is completed/received');

select is((select count(*) from purchase_invoices where id = 'd6200000-0000-4000-8000-000000000030'), 1::bigint, 'completed invoice remains intact');

-- 6. Test 8: Non-Owner Authorization Rejected
select throws_ok($$select delete_purchase_invoice(
  'd6200000-0000-4000-8000-000000000099',
  'd6200000-0000-4000-8000-000000000002'
)$$, 'P0001', 'FORBIDDEN', 'rejects non-owner admin employee');

select * from finish();
rollback;

