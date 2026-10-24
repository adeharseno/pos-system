-- Product creation with an optional first batch must be one transaction.
create or replace function public.create_product_with_base_unit_and_initial_stock(
  p_sku text, p_name text, p_category_id uuid, p_subcategory_id uuid, p_base_unit text,
  p_unit_name text, p_selling_price numeric,
  p_generic_name text default null, p_description text default null, p_manufacturer text default null,
  p_image_url text default null, p_storage_location_id uuid default null, p_default_supplier_id uuid default null,
  p_cost_price numeric default 0, p_tax_rate numeric default 0, p_is_taxable boolean default false,
  p_drug_classification public.drug_classification default 'otc', p_minimum_stock integer default 0,
  p_is_active boolean default true, p_barcode text default null, p_initial_batch jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_business_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_batch_number text;
  v_expired_date date;
  v_received_date date;
  v_quantity integer;
  v_batch_cost numeric(14,2);
  v_created jsonb;
  v_product_id uuid;
  v_batch_id uuid;
begin
  if p_initial_batch is null then
    return public.create_product_with_base_unit(
      p_sku,p_name,p_category_id,p_subcategory_id,p_base_unit,p_unit_name,p_selling_price,
      p_generic_name,p_description,p_manufacturer,p_image_url,p_storage_location_id,p_default_supplier_id,
      p_cost_price,p_tax_rate,p_is_taxable,p_drug_classification,p_minimum_stock,p_is_active,p_barcode
    );
  end if;

  if not p_is_active then raise exception 'PRODUCT_INACTIVE'; end if;
  if jsonb_typeof(p_initial_batch) <> 'object'
    or btrim(coalesce(p_initial_batch->>'batch_number','')) = ''
    or coalesce(p_initial_batch->>'quantity','') !~ '^[1-9][0-9]*$'
    or coalesce(p_initial_batch->>'cost_price','') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    or coalesce(p_initial_batch->>'expired_date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or (p_initial_batch ? 'received_date' and coalesce(p_initial_batch->>'received_date','') !~ '^\d{4}-\d{2}-\d{2}$')
  then raise exception 'INVALID_BATCH'; end if;

  begin
    v_expired_date := (p_initial_batch->>'expired_date')::date;
    v_received_date := coalesce((p_initial_batch->>'received_date')::date, v_business_date);
  exception when others then raise exception 'INVALID_BATCH'; end;
  if v_expired_date < v_business_date then raise exception 'EXPIRED_BATCH'; end if;
  v_quantity := (p_initial_batch->>'quantity')::integer;
  v_batch_cost := (p_initial_batch->>'cost_price')::numeric;
  if v_batch_cost < 0 then raise exception 'INVALID_BATCH'; end if;
  v_batch_number := btrim(p_initial_batch->>'batch_number');

  -- Match receiving semantics: an active opname freezes all stock mutation.
  perform pg_advisory_xact_lock(73194001);
  if exists (select 1 from public.stock_opname_sessions where status = 'in_progress') then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  v_created := public.create_product_with_base_unit(
    p_sku,p_name,p_category_id,p_subcategory_id,p_base_unit,p_unit_name,p_selling_price,
    p_generic_name,p_description,p_manufacturer,p_image_url,p_storage_location_id,p_default_supplier_id,
    p_cost_price,p_tax_rate,p_is_taxable,p_drug_classification,p_minimum_stock,p_is_active,p_barcode
  );
  v_product_id := (v_created->>'product_id')::uuid;
  insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price,received_date)
  values(v_product_id,v_batch_number,v_expired_date,v_quantity,v_batch_cost,v_received_date)
  returning id into v_batch_id;

  return v_created || jsonb_build_object('batch_id',v_batch_id,'batch_count',1);
end; $$;

revoke all on function public.create_product_with_base_unit_and_initial_stock(text,text,uuid,uuid,text,text,numeric,text,text,text,text,uuid,uuid,numeric,numeric,boolean,public.drug_classification,integer,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_product_with_base_unit_and_initial_stock(text,text,uuid,uuid,text,text,numeric,text,text,text,text,uuid,uuid,numeric,numeric,boolean,public.drug_classification,integer,boolean,text,jsonb) to service_role;
