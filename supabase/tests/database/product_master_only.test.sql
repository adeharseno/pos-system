begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(8);
insert into categories(id,name) values('a1000000-0000-4000-8000-000000000001','Master only category');
insert into subcategories(id,category_id,name) values('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Master only subcategory');
insert into products(sku,name,base_unit,category_id,subcategory_id,minimum_stock,cost_price)
values('MASTER-ONLY-TEST','Master only','Tablet','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',5,null);
select ok((select cost_price is null from products where sku='MASTER-ONLY-TEST'),'unknown cost stays null');
select is((select minimum_stock from products where sku='MASTER-ONLY-TEST'),5,'minimum stock is five');
select is((select count(*)::integer from product_units u join products p on p.id=u.product_id where p.sku='MASTER-ONLY-TEST'),0,'no fictitious priced unit');
select is((select count(*)::integer from product_batches b join products p on p.id=b.product_id where p.sku='MASTER-ONLY-TEST'),0,'no initial stock or batch');
select throws_ok($$insert into products(sku,name,base_unit,category_id,subcategory_id,cost_price) select sku,name,base_unit,category_id,subcategory_id,null from products where sku='MASTER-ONLY-TEST'$$,'23505',null,'duplicate SKU rejected');
select throws_ok($$update products set minimum_stock=-1 where sku='MASTER-ONLY-TEST'$$,'23514',null,'negative minimum rejected');
select throws_ok($$update products set default_supplier_id='a3000000-0000-4000-8000-000000000099' where sku='MASTER-ONLY-TEST'$$,'23503',null,'missing supplier rejected');
select throws_ok($$update products set subcategory_id='a2000000-0000-4000-8000-000000000099' where sku='MASTER-ONLY-TEST'$$,'23503',null,'invalid category/subcategory rejected');
select * from finish();
rollback;
