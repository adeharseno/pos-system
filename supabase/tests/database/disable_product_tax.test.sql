begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into categories(id, name) values('b1000000-0000-4000-8000-000000000001', 'Tax Test Category');
insert into subcategories(id, name) values('b2000000-0000-4000-8000-000000000001', 'Tax Test Subcategory');

-- Test 1: Column default on is_taxable is false
select col_default_is('public', 'products', 'is_taxable', 'false', 'is_taxable defaults to false');

-- Test 2: Insert product with tax_rate > 0 but default is_taxable results in false
insert into products(sku, name, base_unit, category_id, subcategory_id, tax_rate)
values('TAX-TEST-001', 'Tax Default Product', 'Tablet', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 11.00);

select is(
  (select is_taxable from products where sku = 'TAX-TEST-001'),
  false,
  'new product defaults is_taxable to false even with tax_rate 11'
);

-- Test 3: RPC create_product_with_base_unit inserts is_taxable = false
select (create_product_with_base_unit(
  'TAX-TEST-002', 'RPC Tax Product',
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'Tablet', 'Tablet', 10000,
  null, null, null, null, null, null,
  5000, 11, true
));

select is(
  (select is_taxable from products where sku = 'TAX-TEST-002'),
  false,
  'create_product_with_base_unit enforces is_taxable = false'
);

-- Test 4: Existing products with is_taxable = false remain untouched
select is(
  (select count(*)::integer from products where is_taxable = true),
  0,
  'zero products remain taxable in database'
);

-- Test 5: Verify product details like price and unit are preserved
select is(
  (select selling_price from product_units u join products p on p.id = u.product_id where p.sku = 'TAX-TEST-002'),
  10000::numeric,
  'selling price is preserved untouched'
);

select * from finish();
rollback;
