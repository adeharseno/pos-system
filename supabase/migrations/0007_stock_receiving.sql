-- M2.11A: receive one product's base-unit stock into one or more batches atomically.
create or replace function public.receive_product_stock(
  p_employee_id uuid,
  p_product_id uuid,
  p_batches jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_business_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_batch_number text;
  v_expired_date date;
  v_received_date date;
  v_quantity integer;
  v_cost_price numeric(14,2);
  v_count integer := 0;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then raise exception 'INVALID_EMPLOYEE'; end if;

  select * into v_product from public.products where id = p_product_id for key share;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not v_product.is_active then raise exception 'PRODUCT_INACTIVE'; end if;
  if p_batches is null or jsonb_typeof(p_batches) <> 'array' or jsonb_array_length(p_batches) = 0 then raise exception 'INVALID_BATCH'; end if;

  -- Serialize with stock-opname start, which uses this same transaction lock.
  perform pg_advisory_xact_lock(73194001);
  if exists (select 1 from public.stock_opname_sessions where status = 'in_progress') then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  for v_item in select value from jsonb_array_elements(p_batches) loop
    if jsonb_typeof(v_item) <> 'object'
      or btrim(coalesce(v_item->>'batch_number','')) = ''
      or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
      or coalesce(v_item->>'cost_price','') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      or coalesce(v_item->>'expired_date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or (v_item ? 'received_date' and coalesce(v_item->>'received_date','') !~ '^\d{4}-\d{2}-\d{2}$')
    then raise exception 'INVALID_BATCH'; end if;
    begin
      v_expired_date := (v_item->>'expired_date')::date;
      v_received_date := coalesce((v_item->>'received_date')::date, v_business_date);
    exception when others then raise exception 'INVALID_BATCH'; end;
    if v_expired_date < v_business_date then raise exception 'EXPIRED_BATCH'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_cost_price := (v_item->>'cost_price')::numeric;
    if v_cost_price < 0 then raise exception 'INVALID_BATCH'; end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_batches) value
    group by btrim(value->>'batch_number'), (value->>'expired_date')::date
    having count(*) > 1
  ) then raise exception 'DUPLICATE_BATCH'; end if;

  if exists (
    select 1 from public.product_batches pb
    join jsonb_array_elements(p_batches) value
      on pb.batch_number = btrim(value->>'batch_number') and pb.expired_date = (value->>'expired_date')::date
    where pb.product_id = p_product_id
  ) then raise exception 'DUPLICATE_BATCH'; end if;

  for v_item in select value from jsonb_array_elements(p_batches) loop
    insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price,received_date)
    values (
      p_product_id,
      btrim(v_item->>'batch_number'),
      (v_item->>'expired_date')::date,
      (v_item->>'quantity')::integer,
      (v_item->>'cost_price')::numeric,
      coalesce((v_item->>'received_date')::date, v_business_date)
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('product_id',p_product_id,'batch_count',v_count);
end; $$;

revoke all on function public.receive_product_stock(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.receive_product_stock(uuid,uuid,jsonb) to service_role;
