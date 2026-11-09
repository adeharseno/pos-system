-- Migration 0061: Transaction fulfillment display view & fulfillment authorization fix
-- 1. Provides operational fulfillment status alongside financial status without modifying core transaction records.
-- 2. Fixes fulfill_bpjs_susulan_item to check position = 'owner_admin' (fixing column 'role' does not exist error).

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

drop view if exists public.transaction_history_view;

create view public.transaction_history_view as
select
  t.id,
  t.invoice_number,
  t.created_at,
  t.business_date,
  t.payment_method,
  t.status as financial_status,
  t.total_amount,
  t.cashier_id,
  e.full_name as cashier_name,
  case
    when t.status = 'voided' then 'voided'
    when t.status = 'pending_payment' then 'pending_payment'
    when t.payment_method = 'bpjs' and exists (
      select 1 from public.bpjs_susulan_items s
      where s.transaction_id = t.id and s.fulfillment_status = 'pending_fulfillment'
    ) then 'incomplete_fulfillment'
    else t.status::text
  end as status
from public.transactions t
left join public.employees e on e.id = t.cashier_id;

revoke all on public.transaction_history_view from public, anon, authenticated;
grant select on public.transaction_history_view to service_role;

-- Fix fulfill_bpjs_susulan_item authorization check: employees table uses 'position', not 'role'
drop function if exists public.fulfill_bpjs_susulan_item(uuid,uuid);

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
    select 1 from public.employees where id = p_employee_id and position = 'owner_admin'::public.employee_position
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
