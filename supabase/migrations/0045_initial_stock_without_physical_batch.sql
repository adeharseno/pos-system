begin;

alter table public.product_batches
  alter column batch_number drop not null;

alter table public.product_batches
  add constraint product_batches_anonymous_has_no_expiry
  check (batch_number is not null or expired_date is null);

create unique index manual_stock_receiving_events_one_initial_per_product
  on public.manual_stock_receiving_events(product_id)
  where source = 'initial';

create or replace function public.receive_initial_product_stock(
  p_request_id uuid,
  p_employee_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_cost_price numeric,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.manual_stock_receiving_requests%rowtype;
  v_product public.products%rowtype;
  v_fingerprint jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_occurred_at timestamptz := clock_timestamp();
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if p_request_id is null or p_employee_id is null or p_product_id is null
    or p_quantity is null or p_quantity <= 0
    or p_cost_price is null or p_cost_price < 0 or p_cost_price::text = 'NaN'
    or length(coalesce(v_reference, '')) > 200
  then raise exception 'INVALID_INITIAL_STOCK'; end if;

  if not exists (
    select 1 from public.employees
    where id = p_employee_id and is_active and position = 'owner_admin'
  ) then raise exception 'INVALID_EMPLOYEE'; end if;

  v_fingerprint := jsonb_build_object(
    'source', 'initial',
    'employee_id', p_employee_id,
    'product_id', p_product_id,
    'quantity', p_quantity,
    'cost_price', p_cost_price,
    'reference', v_reference
  );

  -- Same request serializes retries. The product lock separately serializes
  -- different request IDs attempting to initialize the same product.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 240045));
  select * into v_existing
  from public.manual_stock_receiving_requests
  where request_id = p_request_id;
  if found then
    if v_existing.payload <> v_fingerprint then raise exception 'INITIAL_STOCK_REQUEST_CONFLICT'; end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text, 240046));
  select * into v_product from public.products where id = p_product_id for key share;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not v_product.is_active then raise exception 'PRODUCT_INACTIVE'; end if;

  -- Match the existing receiving/opname lock order before any batch mutation.
  perform pg_advisory_xact_lock(73194001);
  if exists (select 1 from public.stock_opname_sessions where status = 'in_progress') then
    raise exception 'STOCK_OPNAME_IN_PROGRESS';
  end if;
  if exists (select 1 from public.product_batches where product_id = p_product_id) then
    raise exception 'INITIAL_STOCK_ALREADY_EXISTS';
  end if;

  insert into public.product_batches(
    product_id, batch_number, expired_date, quantity, cost_price,
    received_date, purchase_invoice_item_id
  ) values (
    p_product_id, null, null, p_quantity, p_cost_price,
    (v_occurred_at at time zone 'Asia/Jakarta')::date, null
  ) returning id into v_batch_id;

  v_result := jsonb_build_object(
    'request_id', p_request_id,
    'product_id', p_product_id,
    'batch_id', v_batch_id,
    'quantity', p_quantity,
    'replayed', false
  );

  insert into public.manual_stock_receiving_requests(
    request_id, source, product_id, actor_id, payload, result, created_at
  ) values (
    p_request_id, 'initial', p_product_id, p_employee_id,
    v_fingerprint, v_result, v_occurred_at
  );

  insert into public.manual_stock_receiving_events(
    request_id, source, product_id, batch_id, quantity_base,
    actor_id, occurred_at, reason, supplier_id, reference
  ) values (
    p_request_id, 'initial', p_product_id, v_batch_id, p_quantity,
    p_employee_id, v_occurred_at, 'Stok awal', null, v_reference
  );

  return v_result;
end;
$$;

revoke all on function public.receive_initial_product_stock(uuid,uuid,uuid,integer,numeric,text)
  from public, anon, authenticated, service_role;
grant execute on function public.receive_initial_product_stock(uuid,uuid,uuid,integer,numeric,text)
  to service_role;
comment on function public.receive_initial_product_stock(uuid,uuid,uuid,integer,numeric,text) is
  'Atomic idempotent initial stock receipt with an anonymous non-expiring batch and immutable source=initial event.';

commit;
