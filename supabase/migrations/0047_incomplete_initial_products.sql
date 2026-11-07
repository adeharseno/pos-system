-- Step 7C.5: explicit review states for incomplete legacy master data.
begin;

alter table public.products alter column base_unit drop not null;
alter table public.products
  add column unit_confirmed boolean not null default true,
  add column classification_pending boolean not null default false,
  add column legacy_supplier_text text;
alter table public.products add constraint products_unit_state_consistent
  check ((unit_confirmed and nullif(btrim(base_unit), '') is not null)
      or (not unit_confirmed and base_unit is null));

create or replace function public.guard_unknown_unit_sale()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists (select 1 from public.products where id=new.product_id
             and (not unit_confirmed or classification_pending)) then
    raise exception 'PRODUCT_MASTER_INCOMPLETE';
  end if;
  return new;
end; $$;
create trigger guard_unknown_unit_sale
before insert or update of product_id,product_unit_id on public.transaction_items
for each row execute function public.guard_unknown_unit_sale();

create or replace function public.confirm_initial_product_unit(
  p_employee_id uuid, p_product_id uuid, p_unit_name text,
  p_selling_price numeric, p_expected_stock integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_product public.products%rowtype; v_actual bigint; v_unit_id uuid;
begin
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin')
    then raise exception 'INVALID_EMPLOYEE'; end if;
  if nullif(btrim(coalesce(p_unit_name,'')),'') is null or p_selling_price is null or p_selling_price<0
     or p_expected_stock is null or p_expected_stock<0 then raise exception 'INVALID_UNIT_CONFIRMATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text,240047));
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_product.unit_confirmed then raise exception 'UNIT_ALREADY_CONFIRMED'; end if;
  select coalesce(sum(quantity),0) into v_actual from public.product_batches where product_id=p_product_id;
  if v_actual<>p_expected_stock then raise exception 'STOCK_CONFIRMATION_MISMATCH'; end if;
  insert into public.product_units(product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
  values(p_product_id,btrim(p_unit_name),1,p_selling_price,true) returning id into v_unit_id;
  update public.products set base_unit=btrim(p_unit_name),unit_confirmed=true,updated_at=now() where id=p_product_id;
  return jsonb_build_object('product_id',p_product_id,'product_unit_id',v_unit_id,'stock_confirmed',v_actual);
end; $$;
revoke all on function public.confirm_initial_product_unit(uuid,uuid,text,numeric,integer) from public,anon,authenticated,service_role;
grant execute on function public.confirm_initial_product_unit(uuid,uuid,text,numeric,integer) to service_role;

create or replace function public.import_initial_products(p_request_id uuid,p_employee_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.initial_product_import_requests%rowtype; v_row jsonb; v_product_id uuid;
  v_batch_request uuid; v_category_id uuid; v_subcategory_id uuid; v_supplier_id uuid;
  v_count integer; v_total bigint:=0; v_result jsonb; v_unit text; v_category text; v_subcategory text; v_supplier text;
begin
  if p_request_id is null or p_employee_id is null or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>10000 then raise exception 'INVALID_INITIAL_IMPORT'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin')
    then raise exception 'INVALID_EMPLOYEE'; end if;
  perform pg_advisory_xact_lock(73194046);
  select * into v_existing from public.initial_product_import_requests where request_id=p_request_id;
  if found then
    if v_existing.actor_id<>p_employee_id or v_existing.payload<>p_rows then raise exception 'INITIAL_IMPORT_REQUEST_CONFLICT'; end if;
    return v_existing.result||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from public.products) then raise exception 'INITIAL_IMPORT_REQUIRES_EMPTY_PRODUCTS'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row)<>'object' or nullif(btrim(v_row->>'sku'),'') is null
       or nullif(btrim(v_row->>'name'),'') is null or not(v_row?'selling_price') or not(v_row?'cost_price') or not(v_row?'stock')
       or (v_row->>'selling_price')::numeric<0 or (v_row->>'cost_price')::numeric<0 or (v_row->>'stock')::integer<0
       then raise exception 'INVALID_INITIAL_IMPORT_ROW'; end if;
    v_unit:=nullif(btrim(coalesce(v_row->>'base_unit','')),'');
    v_category:=nullif(btrim(coalesce(v_row->>'category_name','')),'');
    v_subcategory:=nullif(btrim(coalesce(v_row->>'subcategory_name','')),'');
    v_supplier:=nullif(btrim(coalesce(v_row->>'supplier_text','')),'');
    v_category_id:=null; v_subcategory_id:=null; v_supplier_id:=null;
    if v_category is not null then
      select id into v_category_id from public.categories where lower(btrim(name))=lower(v_category);
      if not found then insert into public.categories(name) values(v_category) returning id into v_category_id; end if;
    end if;
    if v_subcategory is not null then
      select id into v_subcategory_id from public.subcategories where lower(btrim(name))=lower(v_subcategory);
      if not found then insert into public.subcategories(name) values(v_subcategory) returning id into v_subcategory_id; end if;
    end if;
    if v_supplier is not null then select id into v_supplier_id from public.suppliers where lower(btrim(name))=lower(v_supplier) and is_active; end if;
    v_product_id:=gen_random_uuid();
    insert into public.products(id,sku,name,category_id,subcategory_id,drug_classification,base_unit,cost_price,
      default_supplier_id,is_active,unit_confirmed,classification_pending,legacy_supplier_text)
    values(v_product_id,btrim(v_row->>'sku'),btrim(v_row->>'name'),v_category_id,v_subcategory_id,
      case when v_category is null then 'otc'::public.drug_classification else (v_row->>'drug_classification')::public.drug_classification end,
      v_unit,(v_row->>'cost_price')::numeric,v_supplier_id,true,v_unit is not null,v_category is null,v_supplier);
    if v_unit is not null then
      insert into public.product_units(product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
      values(v_product_id,v_unit,1,(v_row->>'selling_price')::numeric,true);
    end if;
    v_count:=(v_row->>'stock')::integer; v_total:=v_total+v_count;
    if v_count>0 then v_batch_request:=gen_random_uuid(); perform public.receive_initial_product_stock(v_batch_request,p_employee_id,v_product_id,v_count,(v_row->>'cost_price')::numeric,'Impor data awal'); end if;
  end loop;
  v_result:=jsonb_build_object('request_id',p_request_id,'product_count',jsonb_array_length(p_rows),'stock_total',v_total,'replayed',false);
  insert into public.initial_product_import_requests(request_id,actor_id,payload,result) values(p_request_id,p_employee_id,p_rows,v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INITIAL_IMPORT_ROW';
end; $$;
revoke all on function public.import_initial_products(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.import_initial_products(uuid,uuid,jsonb) to service_role;

commit;
