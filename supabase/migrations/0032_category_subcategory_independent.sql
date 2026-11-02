BEGIN;

-- Category ("Golongan") and Subcategory ("Bentuk Sediaan") become two
-- independent master lists. A product may pair any subcategory with any
-- category; there is no parent/child relationship.

-- 1. Products no longer validate the category/subcategory pair.
alter table public.products drop constraint if exists fk_products_subcategory_category;

-- 2. Merge duplicate subcategory names across former parents: repoint products
--    to one survivor, then delete the duplicates.
with ranked as (
  select id,
         first_value(id) over (partition by lower(btrim(name)) order by created_at, id) as survivor,
         row_number() over (partition by lower(btrim(name)) order by created_at, id) as rn
  from public.subcategories
)
update public.products p
set subcategory_id = r.survivor
from ranked r
where p.subcategory_id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (partition by lower(btrim(name)) order by created_at, id) as rn
  from public.subcategories
)
delete from public.subcategories s
using ranked r
where s.id = r.id and r.rn > 1;

-- 3. Remove the parent column and its constraints/indexes.
drop index if exists public.idx_subcategories_category;
drop index if exists public.uq_subcategories_normalized_category_name;
alter table public.subcategories drop constraint if exists subcategories_category_id_fkey;
alter table public.subcategories drop constraint if exists subcategories_category_id_name_key;
alter table public.subcategories drop constraint if exists subcategories_id_category_id_key;
alter table public.subcategories drop column if exists category_id;

-- 4. Both product references are independent and nullable.
alter table public.products alter column category_id drop not null;
alter table public.products alter column subcategory_id drop not null;

-- 5. One unique name per master list, case- and whitespace-insensitive.
create unique index if not exists uq_subcategories_normalized_name
  on public.subcategories (lower(btrim(name)));

-- 6. Direct independent FKs.
alter table public.products drop constraint if exists fk_products_category;
alter table public.products drop constraint if exists fk_products_subcategory;
alter table public.products
  add constraint fk_products_category foreign key (category_id) references public.categories(id) on delete restrict;
alter table public.products
  add constraint fk_products_subcategory foreign key (subcategory_id) references public.subcategories(id) on delete restrict;

-- 7. Product creation no longer requires the subcategory to belong to the
--    category. The two references are validated independently by their FKs.
create or replace function public.create_product_with_base_unit(
  p_sku text, p_name text, p_category_id uuid, p_subcategory_id uuid, p_base_unit text,
  p_unit_name text, p_selling_price numeric,
  p_generic_name text default null, p_description text default null, p_manufacturer text default null,
  p_image_url text default null, p_storage_location_id uuid default null, p_default_supplier_id uuid default null,
  p_cost_price numeric default 0, p_tax_rate numeric default 0, p_is_taxable boolean default false,
  p_drug_classification public.drug_classification default 'otc', p_minimum_stock integer default 0,
  p_is_active boolean default true, p_barcode text default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_product_id uuid:=gen_random_uuid(); v_unit_id uuid:=gen_random_uuid(); v_sku text:=btrim(coalesce(p_sku,'')); v_name text:=btrim(coalesce(p_name,'')); v_base text:=btrim(coalesce(p_base_unit,'')); v_unit text:=btrim(coalesce(p_unit_name,'')); v_barcode text:=nullif(btrim(coalesce(p_barcode,'')), '');
begin
  if v_sku='' or v_name='' or v_base='' or v_unit='' then raise exception 'INVALID_PRODUCT_INPUT'; end if;
  if p_selling_price<0 or p_cost_price<0 or p_tax_rate<0 or p_tax_rate>100 or p_minimum_stock<0 then raise exception 'INVALID_PRODUCT_INPUT'; end if;
  if v_unit<>v_base then raise exception 'BASE_UNIT_MISMATCH'; end if;
  if p_default_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_default_supplier_id) then raise exception 'INVALID_SUPPLIER'; end if;
  if p_storage_location_id is not null and not exists(select 1 from public.storage_locations where id=p_storage_location_id) then raise exception 'INVALID_STORAGE_LOCATION'; end if;
  if exists(select 1 from public.products where sku=v_sku) then raise exception 'DUPLICATE_SKU'; end if;
  if v_barcode is not null and exists(select 1 from public.product_units where barcode=v_barcode) then raise exception 'DUPLICATE_BARCODE'; end if;
  insert into public.products(id,sku,name,generic_name,description,manufacturer,image_url,category_id,subcategory_id,base_unit,cost_price,tax_rate,is_taxable,storage_location_id,default_supplier_id,drug_classification,minimum_stock,is_active)
  values(v_product_id,v_sku,v_name,nullif(btrim(coalesce(p_generic_name,'')),''),nullif(btrim(coalesce(p_description,'')),''),nullif(btrim(coalesce(p_manufacturer,'')),''),nullif(btrim(coalesce(p_image_url,'')),''),p_category_id,p_subcategory_id,v_base,p_cost_price,p_tax_rate,(p_tax_rate > 0),p_storage_location_id,p_default_supplier_id,p_drug_classification,p_minimum_stock,p_is_active);
  insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,barcode,is_base_unit) values(v_unit_id,v_product_id,v_unit,1,p_selling_price,v_barcode,true);
  return jsonb_build_object('product_id',v_product_id,'product_unit_id',v_unit_id);
exception when unique_violation then
  if exists(select 1 from public.products where sku=v_sku) then raise exception 'DUPLICATE_SKU'; end if;
  raise exception 'DUPLICATE_BARCODE';
end; $$;

-- 8. Legacy master lists.
insert into public.categories(name)
select value from (values ('Obat Bebas'),('Obat Resep'),('Racik'),('Psikotropika')) v(value)
where not exists (select 1 from public.categories c where lower(btrim(c.name)) = lower(btrim(v.value)));

insert into public.subcategories(name)
select value from (values ('Syrup'),('Tablet'),('Injeksi'),('Infus'),('Alkes'),('Supp'),('Cream'),('Obat Tetes'),('Bebas')) v(value)
where not exists (select 1 from public.subcategories s where lower(btrim(s.name)) = lower(btrim(v.value)));

COMMIT;
