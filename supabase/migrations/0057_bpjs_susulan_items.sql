begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- ───────────────────────────────────────────────────────────
-- Table: bpjs_susulan_items
-- Stores BPJS follow-up (susulan) products that are promised
-- for delivery the next day but are not yet in stock.
-- ───────────────────────────────────────────────────────────
create table if not exists public.bpjs_susulan_items (
  id                  uuid primary key default gen_random_uuid(),
  transaction_id      uuid not null references public.transactions(id) on delete restrict,
  drug_name           text not null check (char_length(btrim(drug_name)) > 0),
  quantity            integer not null check (quantity > 0),
  unit_price          numeric(15,2) not null check (unit_price >= 0),
  line_total          numeric(15,2) generated always as (quantity * unit_price) stored,
  delivery_date       date not null,
  fulfillment_status  text not null default 'pending_fulfillment'
                        check (fulfillment_status in ('pending_fulfillment','completed')),
  fulfilled_by        uuid references public.employees(id) on delete set null,
  fulfilled_at        timestamptz,
  created_at          timestamptz not null default clock_timestamp(),
  created_by          uuid not null references public.employees(id) on delete restrict,
  -- Idempotency: prevent duplicate inserts for the same checkout request
  request_key         text not null,
  constraint bpjs_susulan_items_fulfillment_check check (
    (fulfillment_status = 'pending_fulfillment' and fulfilled_by is null and fulfilled_at is null)
    or (fulfillment_status = 'completed' and fulfilled_by is not null and fulfilled_at is not null)
  )
);

-- Index for fast lookups by transaction
create index if not exists idx_bpjs_susulan_items_transaction
  on public.bpjs_susulan_items(transaction_id);

-- Index for pending fulfillment alert count
create index if not exists idx_bpjs_susulan_items_pending
  on public.bpjs_susulan_items(fulfillment_status)
  where fulfillment_status = 'pending_fulfillment';

-- Unique idempotency key per transaction + item slot
create unique index if not exists idx_bpjs_susulan_items_request_key
  on public.bpjs_susulan_items(request_key);

-- RLS
alter table public.bpjs_susulan_items enable row level security;
revoke all on public.bpjs_susulan_items from public, anon, authenticated;
grant select, insert, update on public.bpjs_susulan_items to service_role;

-- ───────────────────────────────────────────────────────────
-- RPC: insert_bpjs_susulan_items
-- Atomically inserts susulan items for a completed transaction.
-- Uses per-item request_key for idempotency (safe to retry).
-- p_items: [{drug_name, quantity, unit_price, request_key}]
-- ───────────────────────────────────────────────────────────
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

  -- Verify transaction exists and belongs to BPJS category
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
end;
$$;

revoke all on function public.insert_bpjs_susulan_items(uuid,uuid,date,jsonb) from public, anon, authenticated;
grant execute on function public.insert_bpjs_susulan_items(uuid,uuid,date,jsonb) to service_role;

-- ───────────────────────────────────────────────────────────
-- RPC: fulfill_bpjs_susulan_item
-- Marks a susulan item as completed. Only allowed for owner_admin.
-- ───────────────────────────────────────────────────────────
create or replace function public.fulfill_bpjs_susulan_item(
  p_susulan_id  uuid,
  p_employee_id uuid
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Verify employee is owner_admin
  if not exists (
    select 1 from public.employees where id = p_employee_id and role = 'owner_admin'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.bpjs_susulan_items
  set fulfillment_status = 'completed',
      fulfilled_by       = p_employee_id,
      fulfilled_at       = clock_timestamp()
  where id = p_susulan_id
    and fulfillment_status = 'pending_fulfillment';

  if not found then
    raise exception 'SUSULAN_ITEM_NOT_FOUND_OR_ALREADY_FULFILLED';
  end if;
end;
$$;

revoke all on function public.fulfill_bpjs_susulan_item(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fulfill_bpjs_susulan_item(uuid,uuid) to service_role;

commit;

