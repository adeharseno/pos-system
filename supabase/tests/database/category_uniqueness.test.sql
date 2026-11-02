begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Category ("Golongan") names are normalized and unique.
select lives_ok($$insert into categories(id,name) values ('c1000000-0000-0000-0000-000000000001',' Golongan Uji ')$$,'normalized category name is accepted once');
select throws_ok($$insert into categories(id,name) values ('c1000000-0000-0000-0000-000000000002','Golongan Uji')$$,23505,'duplicate key value violates unique constraint "uq_categories_normalized_name"','exact duplicate category rejected');
select throws_ok($$insert into categories(id,name) values ('c1000000-0000-0000-0000-000000000003','golongan uji')$$,23505,'duplicate key value violates unique constraint "uq_categories_normalized_name"','case-only duplicate category rejected');
select throws_ok($$insert into categories(id,name) values ('c1000000-0000-0000-0000-000000000004','  GOLONGAN UJI  ')$$,23505,'duplicate key value violates unique constraint "uq_categories_normalized_name"','whitespace-equivalent category rejected');

-- Subcategory ("Bentuk Sediaan") has no parent and is created with a name only.
select lives_ok($$insert into subcategories(id,name) values ('c2000000-0000-0000-0000-000000000001','Bentuk Uji')$$,'subcategory is created with a name only');
select throws_ok($$insert into subcategories(id,name) values ('c2000000-0000-0000-0000-000000000002','bentuk uji')$$,23505,'duplicate key value violates unique constraint "uq_subcategories_normalized_name"','case-insensitive duplicate subcategory rejected');

-- The same subcategory may be paired with products under different categories.
insert into categories(id,name) values
  ('c4000000-0000-0000-0000-000000000001','Golongan A'),
  ('c4000000-0000-0000-0000-000000000002','Golongan B');
select lives_ok($$insert into products(id,sku,name,base_unit,category_id,subcategory_id) values
  ('c3000000-0000-0000-0000-000000000001','PAIR-1','Produk 1','Tablet','c4000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002','PAIR-2','Produk 2','Tablet','c4000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001')$$,'one subcategory is assignable to products under different categories');

select * from finish();
rollback;
