begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(11);

insert into categories(id,name) values('e5000000-0000-4000-8000-000000000001','Cashier prescription metadata');
insert into products(id,sku,name,base_unit,category_id,minimum_stock,drug_classification) values
('e5000000-0000-4000-8000-000000000002','RX-META-1','Prescription metadata product','Tablet','e5000000-0000-4000-8000-000000000001',0,'otc'),
('e5000000-0000-4000-8000-000000000003','RX-META-2','Required prescription product','Tablet','e5000000-0000-4000-8000-000000000001',0,'prescription_required');
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('e5000000-0000-4000-8000-000000000004','e5000000-0000-4000-8000-000000000002','Tablet',1,100,true),
('e5000000-0000-4000-8000-000000000005','e5000000-0000-4000-8000-000000000003','Tablet',1,100,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values
('e5000000-0000-4000-8000-000000000006','e5000000-0000-4000-8000-000000000002','META-1','2035-01-01',10,50),
('e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003','META-2','2035-01-01',10,50);
insert into employees(id,full_name,position) values('e5000000-0000-4000-8000-000000000008','Kasir Metadata','kasir');

create temporary table umum_sale as select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',100,
  '{"prescription_category":"umum","patient_name":"Pasien Umum","prescription_number":"R-UMUM","prescription_origin":"Klinik A","prescription_date":"2026-11-07"}'
) data;
select is((select data->>'status' from umum_sale),'completed','UMUM cash checkout remains completed');
select is((select prescription_category from transaction_prescriptions p join umum_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'umum','UMUM category persisted');
select is((select patient_name from transaction_prescriptions p join umum_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'Pasien Umum','UMUM patient persisted');
select is((select bpjs_number from transaction_prescriptions p join umum_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),null::text,'UMUM stores no BPJS number');

create temporary table bpjs_sale as select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','qris',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',null,
  '{"prescription_category":"bpjs","patient_name":"Pasien BPJS","bpjs_number":"000123","prescription_number":"R-BPJS"}'
) data;
select is((select data->>'status' from bpjs_sale),'pending_payment','BPJS keeps existing QRIS behavior');
select is((select prescription_category from transaction_prescriptions p join bpjs_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'bpjs','BPJS category persisted');
select is((select bpjs_number from transaction_prescriptions p join bpjs_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'000123','BPJS number preserves leading zeros');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000006'),8,'existing checkout still deducts stock once per transaction');

select throws_ok($$select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',100,
  '{"prescription_category":"bpjs"}'
)$$,'P0001','BPJS_NUMBER_REQUIRED','BPJS number is enforced in database');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000006'),8,'failed BPJS validation does not alter stock');

select throws_ok($$select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000005","quantity":1}]',100,
  '{"prescription_category":"umum"}'
)$$,'P0001','PRESCRIPTION_REQUIRED','existing required-prescription guard remains active');

select * from finish();
rollback;
