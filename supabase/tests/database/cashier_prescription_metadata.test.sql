begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(23);

insert into categories(id,name) values('e5000000-0000-4000-8000-000000000001','Cashier prescription metadata');
insert into products(id,sku,name,base_unit,category_id,minimum_stock,drug_classification) values
('e5000000-0000-4000-8000-000000000002','RX-META-1','Prescription metadata product','Tablet','e5000000-0000-4000-8000-000000000001',0,'otc'),
('e5000000-0000-4000-8000-000000000003','RX-META-2','Required prescription product','Tablet','e5000000-0000-4000-8000-000000000001',0,'prescription_required'),
('e5000000-0000-4000-8000-000000000009','BEBAS-58000','BEBAS cash regression product','Unit','e5000000-0000-4000-8000-000000000001',0,'otc');
insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values
('e5000000-0000-4000-8000-000000000004','e5000000-0000-4000-8000-000000000002','Tablet',1,100,true),
('e5000000-0000-4000-8000-000000000005','e5000000-0000-4000-8000-000000000003','Tablet',1,100,true),
('e5000000-0000-4000-8000-000000000010','e5000000-0000-4000-8000-000000000009','Unit',1,58000,true);
insert into product_batches(id,product_id,batch_number,expired_date,quantity,cost_price) values
('e5000000-0000-4000-8000-000000000006','e5000000-0000-4000-8000-000000000002','META-1','2035-01-01',10,50),
('e5000000-0000-4000-8000-000000000007','e5000000-0000-4000-8000-000000000003','META-2','2035-01-01',10,50),
('e5000000-0000-4000-8000-000000000011','e5000000-0000-4000-8000-000000000009','BEBAS-CASH','2035-01-01',2,50000);
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
  'e5000000-0000-4000-8000-000000000008','bpjs',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',0,
  '{"prescription_category":"bpjs","patient_name":"Pasien BPJS","bpjs_number":"000123","prescription_number":"R-BPJS"}'
) data;
select is((select data->>'status' from bpjs_sale),'completed','BPJS checkout completes without manual payment');
select is((select prescription_category from transaction_prescriptions p join bpjs_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'bpjs','BPJS category persisted');
select is((select bpjs_number from transaction_prescriptions p join bpjs_sale s on p.transaction_id=(s.data->>'transaction_id')::uuid),'000123','BPJS number preserves leading zeros');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000006'),8,'existing checkout still deducts stock once per transaction');
select ok((select payment_method::text='bpjs' and cash_received=0 and cash_change=0 from transactions t join bpjs_sale s on t.id=(s.data->>'transaction_id')::uuid),'BPJS is covered with zero tender and zero change');
select is((select total_amount from transactions t join bpjs_sale s on t.id=(s.data->>'transaction_id')::uuid),100::numeric,'BPJS preserves the authoritative transaction total');

select throws_ok($$select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','bpjs',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',0,
  '{"prescription_category":"bpjs"}'
)$$,'P0001','BPJS_NUMBER_REQUIRED','BPJS number is enforced in database');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000006'),8,'failed BPJS validation does not alter stock');

create temporary table bebas_sales as
select method, checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008',method::payment_method,
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000004","quantity":1}]',
  case when method='cash' then 100 else null end,
  '{"prescription_category":"bebas","patient_name":"harus dihapus","prescription_origin":"harus dihapus"}'
) data from (values ('cash'),('qris'),('bank_transfer')) methods(method);
select is((select count(*)::integer from bebas_sales),3,'BEBAS supports cash, QRIS, and bank transfer');
select is((select count(*)::integer from transaction_prescriptions p join bebas_sales s on p.transaction_id=(s.data->>'transaction_id')::uuid where p.prescription_category='bebas'),3,'BEBAS category persists for every payment method');
select ok(not exists(select 1 from transaction_prescriptions p join bebas_sales s on p.transaction_id=(s.data->>'transaction_id')::uuid where p.patient_name is not null or p.prescription_origin is not null),'BEBAS clears patient and prescription fields');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000006'),5,'BEBAS checkout deducts stock once for each transaction');

create temporary table bebas_cash_58000 as select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000010","quantity":1}]',60000,
  '{"prescription_category":"bebas"}'
) data;
select is((select data->>'status' from bebas_cash_58000),'completed','BEBAS cash checkout completes');
select is((select data->>'total_amount' from bebas_cash_58000),'58000.00','BEBAS cash keeps authoritative total');
select is((select data->>'cash_change' from bebas_cash_58000),'2000.00','BEBAS cash returns correct change');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000011'),1,'BEBAS cash deducts stock exactly once');

create temporary table bebas_required as select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000005","quantity":1}]',100,
  '{"prescription_category":"bebas"}'
) data;
select is((select data->>'status' from bebas_required),'completed','BEBAS requires no prescription validation even for a marked product');
select is((select quantity from product_batches where id='e5000000-0000-4000-8000-000000000007'),9,'BEBAS prescription-marked product still deducts stock exactly once');

select throws_ok($$select checkout_transaction_with_prescription(
  'e5000000-0000-4000-8000-000000000008','cash',
  '[{"product_unit_id":"e5000000-0000-4000-8000-000000000005","quantity":1}]',100,
  '{"prescription_category":"umum"}'
)$$,'P0001','PRESCRIPTION_REQUIRED','existing required-prescription guard remains active');

select * from finish();
rollback;
