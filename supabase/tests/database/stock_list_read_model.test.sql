begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(13);

insert into categories(id,name) values('ac100000-0000-4000-8000-000000000001','Read model category');
insert into products(id,sku,name,base_unit,category_id,minimum_stock,is_active,drug_classification) values
('ac300000-0000-4000-8000-000000000001','STEP3A-AC300-OUT','RM A Habis','Tablet','ac100000-0000-4000-8000-000000000001',0,true,'otc'),
('ac300000-0000-4000-8000-000000000002','STEP3A-AC300-LOW','RM B Menipis','Tablet','ac100000-0000-4000-8000-000000000001',5,true,'prescription_required'),
('ac300000-0000-4000-8000-000000000003','STEP3A-AC300-EQUAL','RM C Tepat','Tablet','ac100000-0000-4000-8000-000000000001',5,true,'otc'),
('ac300000-0000-4000-8000-000000000004','STEP3A-AC300-NORMAL','RM D Tersedia','Tablet','ac100000-0000-4000-8000-000000000001',5,true,'otc'),
('ac300000-0000-4000-8000-000000000005','STEP3A-AC300-INACTIVE','RM E Nonaktif','Tablet','ac100000-0000-4000-8000-000000000001',5,false,'otc');
insert into product_units(product_id,unit_name,conversion_to_base,selling_price,barcode,is_base_unit) values
('ac300000-0000-4000-8000-000000000002','Tablet',1,1000,'8990000000034',true);
insert into product_batches(product_id,batch_number,expired_date,quantity,cost_price) values
('ac300000-0000-4000-8000-000000000002','LOW','2030-01-02',4,1),
('ac300000-0000-4000-8000-000000000002','EXPIRED','2025-01-01',99,1),
('ac300000-0000-4000-8000-000000000003','EQUAL','2030-01-03',5,1),
('ac300000-0000-4000-8000-000000000004','NORMAL','2030-01-04',6,1);

create temporary table all_rows as select stock_list_read_model('2026-11-06', 'STEP3A-AC300-', 'all', 'all', 'all', 'name_asc', 1, 100) data;
select is((select count(*) from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'id' like 'ac300000-%'),5::bigint,'all fixture products returned');
select is((select value->>'stockStatus' from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-OUT'),'out','zero stock is out');
select is((select value->>'stockStatus' from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-LOW'),'low','positive stock below minimum is low');
select is((select value->>'stockStatus' from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-EQUAL'),'low','stock equal to minimum is low');
select is((select value->>'stockStatus' from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-NORMAL'),'normal','stock above minimum is normal');
select is((select (value->>'availableStock')::integer from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-LOW'),4,'expired batch excluded');
select is((select value->>'nearestExpiry' from jsonb_array_elements((select data->'rows' from all_rows)) where value->>'sku'='STEP3A-AC300-LOW'),'2030-01-02','nearest valid expiry returned');
select is((stock_list_read_model('2026-11-06','8990000000034','all','all','all','name_asc',1,20)->>'total')::integer,1,'barcode filter runs in database');
select is((stock_list_read_model('2026-11-06','STEP3A-AC300-','active','required','all','name_asc',1,20)->>'total')::integer,1,'active and prescription filters combine');
select is((stock_list_read_model('2026-11-06','STEP3A-AC300-','all','all','needs_restock','stock_asc',1,20)->>'total')::integer,4,'restock filter includes out and low');
select is(jsonb_array_length(stock_list_read_model('2026-11-06','STEP3A-AC300-','all','all','all','name_asc',2,2)->'rows'),2,'second page is limited in database');
select is((stock_list_read_model('2026-11-06','STEP3A-AC300-','all','all','all','name_asc',99,2)->>'total')::integer,5,'empty page preserves filtered total');
select ok(not has_function_privilege('authenticated','stock_list_read_model(date,text,text,text,text,text,integer,integer)','EXECUTE'),'browser cannot call read model RPC');
select * from finish();
rollback;
