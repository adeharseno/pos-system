-- tax_rate is the authoritative pricing input. Keep the legacy flag synchronized.
update public.products
set is_taxable = (tax_rate > 0)
where is_taxable is distinct from (tax_rate > 0);

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
  if not exists(select 1 from public.subcategories where id=p_subcategory_id and category_id=p_category_id) then raise exception 'INVALID_CATEGORY_SUBCATEGORY'; end if;
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
