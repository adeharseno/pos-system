begin;

create table public.initial_product_import_requests (
  request_id uuid primary key,
  actor_id uuid not null references public.employees(id) on delete restrict,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.initial_product_import_requests enable row level security;
revoke all on public.initial_product_import_requests from public, anon, authenticated;

create or replace function public.import_initial_products(
  p_request_id uuid,
  p_employee_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.initial_product_import_requests%rowtype;
  v_row jsonb;
  v_created jsonb;
  v_product_id uuid;
  v_stock_request_id uuid;
  v_count integer;
  v_stock_total bigint := 0;
  v_result jsonb;
begin
  if p_request_id is null or p_employee_id is null or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 10000
  then raise exception 'INVALID_INITIAL_IMPORT'; end if;

  if not exists (
    select 1 from public.employees
    where id = p_employee_id and is_active and position = 'owner_admin'
  ) then raise exception 'INVALID_EMPLOYEE'; end if;

  perform pg_advisory_xact_lock(73194046);
  select * into v_existing from public.initial_product_import_requests where request_id = p_request_id;
  if found then
    if v_existing.actor_id <> p_employee_id or v_existing.payload <> p_rows then
      raise exception 'INITIAL_IMPORT_REQUEST_CONFLICT';
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  if exists (select 1 from public.products) then raise exception 'INITIAL_IMPORT_REQUIRES_EMPTY_PRODUCTS'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
      or nullif(btrim(v_row->>'sku'), '') is null
      or nullif(btrim(v_row->>'name'), '') is null
      or nullif(btrim(v_row->>'base_unit'), '') is null
      or nullif(btrim(v_row->>'category_id'), '') is null
      or nullif(btrim(v_row->>'subcategory_id'), '') is null
      or nullif(btrim(v_row->>'drug_classification'), '') is null
      or not (v_row ? 'selling_price') or not (v_row ? 'cost_price') or not (v_row ? 'stock')
      or (v_row->>'selling_price')::numeric < 0 or (v_row->>'cost_price')::numeric < 0
      or (v_row->>'stock')::integer < 0
    then raise exception 'INVALID_INITIAL_IMPORT_ROW'; end if;

    v_created := public.create_product_with_base_unit(
      p_sku => btrim(v_row->>'sku'), p_name => btrim(v_row->>'name'),
      p_category_id => nullif(v_row->>'category_id', '')::uuid,
      p_subcategory_id => nullif(v_row->>'subcategory_id', '')::uuid,
      p_base_unit => btrim(v_row->>'base_unit'), p_unit_name => btrim(v_row->>'base_unit'),
      p_selling_price => (v_row->>'selling_price')::numeric,
      p_default_supplier_id => nullif(v_row->>'supplier_id', '')::uuid,
      p_cost_price => (v_row->>'cost_price')::numeric,
      p_drug_classification => (v_row->>'drug_classification')::public.drug_classification,
      p_minimum_stock => 0, p_is_active => true
    );
    v_product_id := (v_created->>'product_id')::uuid;
    v_count := (v_row->>'stock')::integer;
    v_stock_total := v_stock_total + v_count;
    if v_count > 0 then
      v_stock_request_id := gen_random_uuid();
      perform public.receive_initial_product_stock(
        v_stock_request_id, p_employee_id, v_product_id, v_count,
        (v_row->>'cost_price')::numeric, 'Impor data awal'
      );
    end if;
  end loop;

  v_result := jsonb_build_object(
    'request_id', p_request_id, 'product_count', jsonb_array_length(p_rows),
    'stock_total', v_stock_total, 'replayed', false
  );
  insert into public.initial_product_import_requests(request_id, actor_id, payload, result)
  values (p_request_id, p_employee_id, p_rows, v_result);
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_INITIAL_IMPORT_ROW';
end;
$$;

revoke all on function public.import_initial_products(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_initial_products(uuid,uuid,jsonb) to service_role;

commit;
