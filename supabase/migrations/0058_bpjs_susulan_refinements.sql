begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- Add product_id reference to bpjs_susulan_items if not present
alter table public.bpjs_susulan_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_bpjs_susulan_items_product
  on public.bpjs_susulan_items(product_id);

-- Update insert_bpjs_susulan_items to also recalculate transaction subtotal and total_amount
create or replace function public.insert_bpjs_susulan_items(
  p_transaction_id  uuid,
  p_employee_id     uuid,
  p_delivery_date   date,
  p_items           jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item       jsonb;
  v_drug_name  text;
  v_quantity   integer;
  v_unit_price numeric(15,2);
  v_req_key    text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  if not exists (
    select 1 from public.transactions t
    join public.transaction_prescriptions tp on tp.transaction_id = t.id
    where t.id = p_transaction_id
      and t.payment_method::text = 'bpjs'
      and tp.prescription_category = 'bpjs'
  ) then
    raise exception 'TRANSACTION_NOT_BPJS';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_drug_name  := btrim(v_item->>'drug_name');
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(15,2);
    v_req_key    := v_item->>'request_key';

    if v_drug_name = '' or v_drug_name is null then raise exception 'SUSULAN_DRUG_NAME_REQUIRED'; end if;
    if v_quantity is null or v_quantity < 1 then raise exception 'SUSULAN_INVALID_QUANTITY'; end if;
    if v_unit_price is null or v_unit_price < 0 then raise exception 'SUSULAN_INVALID_UNIT_PRICE'; end if;
    if v_req_key is null or v_req_key = '' then raise exception 'SUSULAN_MISSING_REQUEST_KEY'; end if;

    insert into public.bpjs_susulan_items(
      transaction_id, drug_name, quantity, unit_price,
      delivery_date, created_by, request_key
    ) values (
      p_transaction_id, v_drug_name, v_quantity, v_unit_price,
      p_delivery_date, p_employee_id, v_req_key
    )
    on conflict (request_key) do nothing;
  end loop;

  -- Recalculate transaction totals to include susulan items
  update public.transactions
  set subtotal = (
        coalesce((select sum(subtotal) from public.transaction_items where transaction_id = p_transaction_id), 0) +
        coalesce((select sum(line_total) from public.bpjs_susulan_items where transaction_id = p_transaction_id), 0)
      ),
      total_amount = (
        coalesce((select sum(total_amount) from public.transaction_items where transaction_id = p_transaction_id), 0) +
        coalesce((select sum(line_total) from public.bpjs_susulan_items where transaction_id = p_transaction_id), 0)
      )
  where id = p_transaction_id;
end;
$$;

revoke all on function public.insert_bpjs_susulan_items(uuid,uuid,date,jsonb) from public, anon, authenticated;
grant execute on function public.insert_bpjs_susulan_items(uuid,uuid,date,jsonb) to service_role;

-- Update fulfill_bpjs_susulan_item to support linking product_id and deducting stock via FEFO
create or replace function public.fulfill_bpjs_susulan_item(
  p_susulan_id  uuid,
  p_employee_id uuid,
  p_product_id  uuid default null
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item       public.bpjs_susulan_items%rowtype;
  v_remaining  integer;
  v_batch      record;
  v_take       integer;
  v_available  integer;
  v_today      date;
begin
  if not exists (
    select 1 from public.employees where id = p_employee_id and role = 'owner_admin'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_item
  from public.bpjs_susulan_items
  where id = p_susulan_id for update;

  if not found then
    raise exception 'SUSULAN_ITEM_NOT_FOUND';
  end if;

  if v_item.fulfillment_status = 'completed' then
    raise exception 'SUSULAN_ALREADY_FULFILLED';
  end if;

  -- If product_id is specified (or already on item), validate and deduct stock
  if p_product_id is not null then
    v_today := (clock_timestamp() at time zone 'Asia/Jakarta')::date;

    -- Lock candidate batches for concurrency safety
    perform 1 from public.product_batches
    where product_id = p_product_id
      and quantity > 0
      and expired_date >= v_today
    for update;

    select coalesce(sum(quantity), 0) into v_available
    from public.product_batches
    where product_id = p_product_id
      and quantity > 0
      and expired_date >= v_today;

    if v_available < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK';
    end if;

    -- FEFO deduction
    v_remaining := v_item.quantity;
    for v_batch in
      select id, quantity
      from public.product_batches
      where product_id = p_product_id
        and quantity > 0
        and expired_date >= v_today
      order by expired_date asc, created_at asc, id asc
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_batch.quantity);
      update public.product_batches
      set quantity = quantity - v_take,
          updated_at = clock_timestamp()
      where id = v_batch.id;
      v_remaining := v_remaining - v_take;
    end loop;
  end if;

  update public.bpjs_susulan_items
  set fulfillment_status = 'completed',
      fulfilled_by       = p_employee_id,
      fulfilled_at       = clock_timestamp(),
      product_id         = coalesce(p_product_id, product_id)
  where id = p_susulan_id;
end;
$$;

revoke all on function public.fulfill_bpjs_susulan_item(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.fulfill_bpjs_susulan_item(uuid,uuid,uuid) to service_role;

commit;

