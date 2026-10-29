begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(8);
insert into categories(id,name) values('ab100000-0000-4000-8000-000000000001','Low stock category');
insert into subcategories(id,category_id,name) values('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','Low stock subcategory');
insert into products(id,sku,name,base_unit,category_id,subcategory_id,minimum_stock,is_active) values
('ab300000-0000-4000-8000-000000000001','LOW-OUT','Habis','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',5,true),
('ab300000-0000-4000-8000-000000000002','LOW-LOW','Menipis','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',5,true),
('ab300000-0000-4000-8000-000000000003','LOW-NORMAL','Normal','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',5,true),
('ab300000-0000-4000-8000-000000000004','LOW-EXPIRED','Kedaluwarsa','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',5,true),
('ab300000-0000-4000-8000-000000000005','LOW-INACTIVE','Nonaktif','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',5,false),
('ab300000-0000-4000-8000-000000000006','LOW-ZERO-SAFE','Minimum Nol Aman','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',0,true),
('ab300000-0000-4000-8000-000000000007','LOW-ZERO-OUT','Minimum Nol Habis','Tablet','ab100000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',0,true);
insert into product_batches(product_id,batch_number,expired_date,quantity,cost_price) values
('ab300000-0000-4000-8000-000000000002','LOW','2030-01-01',4,1),
('ab300000-0000-4000-8000-000000000003','NORMAL','2030-01-01',5,1),
('ab300000-0000-4000-8000-000000000004','EXPIRED','2026-10-29',10,1),
('ab300000-0000-4000-8000-000000000005','INACTIVE','2030-01-01',1,1),
('ab300000-0000-4000-8000-000000000006','ZERO-SAFE','2030-01-01',1,1);
create temporary table result as select coalesce(jsonb_agg(value order by n),'[]'::jsonb) data from jsonb_array_elements(dashboard_low_stock('2026-10-30')) with ordinality rows(value,n) where value->>'id' like 'ab300000-%';
select is(jsonb_array_length((select data from result)),4,'only active problem products returned');
select is((select jsonb_agg(value->>'status') from jsonb_array_elements((select data from result))),'["out", "out", "out", "low"]'::jsonb,'out of stock sorts before low stock');
select ok(not (select data from result) @? '$[*] ? (@.name == "Normal")','normal stock omitted');
select ok(not (select data from result) @? '$[*] ? (@.name == "Nonaktif")','inactive product omitted');
select is((select (value->>'availableStock')::integer from jsonb_array_elements((select data from result)) where value->>'name'='Kedaluwarsa'),0,'expired stock excluded');
select ok((select data from result) @? '$[*] ? (@.name == "Minimum Nol Habis" && @.status == "out")','minimum zero with no stock is out');
select ok(not (select data from result) @? '$[*] ? (@.name == "Minimum Nol Aman")','minimum zero with positive stock is normal');
select ok(not has_function_privilege('authenticated','dashboard_low_stock(date)','EXECUTE'),'browser cannot call dashboard stock RPC');
select * from finish();
rollback;
