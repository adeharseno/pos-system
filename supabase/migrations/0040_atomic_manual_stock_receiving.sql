create table public.manual_stock_receiving_requests (
  request_id uuid primary key,
  source text not null check (source in ('manual','initial')),
  product_id uuid not null references public.products(id) on delete restrict,
  actor_id uuid not null references public.employees(id) on delete restrict,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create table public.manual_stock_receiving_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.manual_stock_receiving_requests(request_id) on delete restrict,
  source text not null check (source in ('manual','initial')),
  product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid not null,
  quantity_base integer not null check (quantity_base > 0),
  actor_id uuid not null references public.employees(id) on delete restrict,
  occurred_at timestamptz not null,
  reason text,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  reference text,
  unique(request_id,batch_id),
  foreign key(batch_id,product_id) references public.product_batches(id,product_id) on delete restrict
);
create index manual_stock_receiving_events_product_time
  on public.manual_stock_receiving_events(product_id,occurred_at desc,id desc);

alter table public.manual_stock_receiving_requests enable row level security;
alter table public.manual_stock_receiving_events enable row level security;
revoke all on public.manual_stock_receiving_requests,public.manual_stock_receiving_events from public,anon,authenticated,service_role;
grant select on public.manual_stock_receiving_requests,public.manual_stock_receiving_events to service_role;

create or replace function public.receive_product_stock_manual(
  p_request_id uuid,
  p_employee_id uuid,
  p_product_id uuid,
  p_batches jsonb,
  p_reason text default null,
  p_supplier_id uuid default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.manual_stock_receiving_requests%rowtype;
  v_fingerprint jsonb;
  v_receive_result jsonb;
  v_result jsonb;
  v_occurred_at timestamptz := clock_timestamp();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_reference text := nullif(btrim(coalesce(p_reference,'')),'');
begin
  if p_request_id is null or p_employee_id is null or p_product_id is null then raise exception 'INVALID_MANUAL_RECEIVING'; end if;
  if length(coalesce(v_reason,'')) > 500 or length(coalesce(v_reference,'')) > 200 then raise exception 'INVALID_MANUAL_RECEIVING'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin') then raise exception 'INVALID_EMPLOYEE'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'INVALID_SUPPLIER'; end if;

  v_fingerprint := jsonb_build_object(
    'source','manual','employee_id',p_employee_id,'product_id',p_product_id,
    'batches',p_batches,'reason',v_reason,'supplier_id',p_supplier_id,'reference',v_reference
  );
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,240040));
  select * into v_existing from public.manual_stock_receiving_requests where request_id=p_request_id;
  if found then
    if v_existing.payload <> v_fingerprint then raise exception 'MANUAL_RECEIVING_REQUEST_CONFLICT'; end if;
    return v_existing.result || jsonb_build_object('replayed',true);
  end if;

  -- Existing RPC remains the single authority for product, batch, expiry, cost,
  -- duplicate and stock-opname validation. Any later failure rolls this back.
  v_receive_result := public.receive_product_stock(p_employee_id,p_product_id,p_batches);

  select v_receive_result || jsonb_build_object(
    'request_id',p_request_id,
    'event_count',jsonb_array_length(p_batches),
    'replayed',false
  ) into v_result;
  insert into public.manual_stock_receiving_requests(request_id,source,product_id,actor_id,payload,result,created_at)
  values(p_request_id,'manual',p_product_id,p_employee_id,v_fingerprint,v_result,v_occurred_at);

  insert into public.manual_stock_receiving_events(
    request_id,source,product_id,batch_id,quantity_base,actor_id,occurred_at,reason,supplier_id,reference
  )
  select p_request_id,'manual',p_product_id,pb.id,(item.value->>'quantity')::integer,
    p_employee_id,v_occurred_at,v_reason,p_supplier_id,v_reference
  from jsonb_array_elements(p_batches) with ordinality item(value,n)
  join public.product_batches pb on pb.product_id=p_product_id
    and pb.batch_number=btrim(item.value->>'batch_number')
    and pb.expired_date=(item.value->>'expired_date')::date;

  if (select count(*) from public.manual_stock_receiving_events where request_id=p_request_id) <> jsonb_array_length(p_batches) then
    raise exception 'MANUAL_RECEIVING_EVENT_MISMATCH';
  end if;
  return v_result;
end;
$$;

revoke all on function public.receive_product_stock_manual(uuid,uuid,uuid,jsonb,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.receive_product_stock_manual(uuid,uuid,uuid,jsonb,text,uuid,text) to service_role;
comment on table public.manual_stock_receiving_events is 'Immutable per-batch audit events for new manual or future initial stock receipts.';
comment on function public.receive_product_stock_manual(uuid,uuid,uuid,jsonb,text,uuid,text) is 'Atomic idempotent manual receiving wrapper; invoice receiving must continue using its existing flow.';
