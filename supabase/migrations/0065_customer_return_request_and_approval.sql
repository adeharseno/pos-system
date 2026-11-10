-- Migration 0064: Customer Return Request + Admin Approval Workflow
-- Adds support for:
-- 1. Return requests submitted by cashier (without stock mutation or immediate refund)
-- 2. Sequential Nota Retur numbers (RET-YYYYMMDD-XXXX)
-- 3. Admin approval/rejection with mandatory admin notes
-- 4. Selective restock for sellable items vs damaged/expired goods
-- 5. Multi-status return lifecycle (pending_approval, approved, rejected, completed)

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- 1. Sequential return numbers
create table if not exists public.return_sequences (
  business_date date primary key,
  last_number integer not null
);

alter table public.return_sequences enable row level security;
drop policy if exists "deny_all_client_access" on public.return_sequences;
create policy "deny_all_client_access" on public.return_sequences for all to authenticated, anon using (false);

-- 2. Extend returns table
alter table public.returns
  add column if not exists return_number text unique,
  add column if not exists status text not null default 'completed',
  add column if not exists requested_by uuid references public.employees(id),
  add column if not exists reviewed_by uuid references public.employees(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists admin_notes text,
  add column if not exists refund_status text not null default 'completed',
  add column if not exists refund_confirmed_at timestamptz,
  add column if not exists refund_confirmed_by uuid references public.employees(id);

alter table public.returns drop constraint if exists chk_returns_status;
alter table public.returns add constraint chk_returns_status check (
  status in ('pending_approval', 'approved', 'rejected', 'completed')
);

alter table public.returns drop constraint if exists chk_returns_refund_status;
alter table public.returns add constraint chk_returns_refund_status check (
  refund_status in ('pending', 'completed')
);

create index if not exists idx_returns_status on public.returns(status);
create index if not exists idx_returns_return_number on public.returns(return_number);
create index if not exists idx_returns_requested_by on public.returns(requested_by);

-- Support bank_transfer and bpjs in refund_method if needed
alter table public.returns drop constraint if exists chk_return_source_refund_shape;
alter table public.returns add constraint chk_return_source_refund_shape check (
  (source = 'customer' and transaction_id is not null and refund_method in ('cash', 'qris', 'bank_transfer', 'bpjs'))
  or (source = 'supplier' and transaction_id is null and refund_method is null)
);

-- 3. Extend return_items table
alter table public.return_items
  add column if not exists condition text not null default 'good',
  add column if not exists is_restocked boolean not null default true,
  add column if not exists restocked_at timestamptz,
  add column if not exists restocked_by uuid references public.employees(id);

alter table public.return_items drop constraint if exists chk_return_items_condition;
alter table public.return_items add constraint chk_return_items_condition check (
  condition in ('good', 'damaged', 'expired')
);

-- 4. Register new permission definitions
insert into public.permission_definitions(code)
values ('returns.approve'), ('returns.reject')
on conflict (code) do nothing;

-- 5. RPC: request_customer_return
create or replace function public.request_customer_return(
  p_employee_id uuid,
  p_transaction_id uuid,
  p_refund_method public.payment_method,
  p_reason text,
  p_items jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_tx public.transactions%rowtype;
  v_item jsonb;
  v_source record;
  v_return_id uuid := gen_random_uuid();
  v_return_item_id uuid;
  v_qty integer;
  v_previous integer;
  v_prev_sub numeric;
  v_prev_tax numeric;
  v_line_sub numeric;
  v_line_tax numeric;
  v_sub numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'RETURN_REASON_REQUIRED';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_RETURN_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'transaction_item_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_item->>'quantity_in_base', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_RETURN_ITEMS';
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct value->>'transaction_item_id') from jsonb_array_elements(p_items)) then
    raise exception 'DUPLICATE_RETURN_ITEM';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  if v_tx.status <> 'completed' then raise exception 'INVALID_TRANSACTION_STATE'; end if;

  -- Lock transaction items
  perform 1 from public.transaction_items ti
  where ti.id in (select (value->>'transaction_item_id')::uuid from jsonb_array_elements(p_items))
  order by ti.id for update;

  -- Validate cumulative unreturned & non-pending quantities
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items
    where id = (v_item->>'transaction_item_id')::uuid and transaction_id = p_transaction_id;
    if not found then raise exception 'INVALID_TRANSACTION_ITEM'; end if;

    select coalesce(sum(ri.quantity_in_base), 0),
           coalesce(sum(ri.refund_subtotal), 0),
           coalesce(sum(ri.refund_tax_amount), 0)
      into v_previous, v_prev_sub, v_prev_tax
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.transaction_item_id = v_source.id
      and r.source = 'customer'
      and r.status in ('pending_approval', 'approved', 'completed');

    if v_previous + v_qty > v_source.quantity_in_base then
      raise exception 'RETURN_QUANTITY_EXCEEDED';
    end if;

    v_line_sub := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.subtotal - v_prev_sub
                       else round(v_source.subtotal * v_qty / v_source.quantity_in_base, 2) end;
    v_line_tax := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.tax_amount - v_prev_tax
                       else round(v_source.tax_amount * v_qty / v_source.quantity_in_base, 2) end;
    v_sub := v_sub + v_line_sub;
    v_tax := v_tax + v_line_tax;
  end loop;

  -- Create returns record with status 'pending_approval' (NO stock deduction or batch update!)
  insert into public.returns(
    id, source, transaction_id, refund_method, reason,
    processed_by, requested_by, refund_subtotal, refund_tax_amount, refund_total,
    status, refund_status
  ) values (
    v_return_id, 'customer', p_transaction_id, p_refund_method, btrim(p_reason),
    p_employee_id, p_employee_id, v_sub, v_tax, v_sub + v_tax,
    'pending_approval', 'pending'
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items where id = (v_item->>'transaction_item_id')::uuid;

    select coalesce(sum(ri.quantity_in_base), 0),
           coalesce(sum(ri.refund_subtotal), 0),
           coalesce(sum(ri.refund_tax_amount), 0)
      into v_previous, v_prev_sub, v_prev_tax
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.transaction_item_id = v_source.id
      and r.source = 'customer'
      and r.id <> v_return_id
      and r.status in ('pending_approval', 'approved', 'completed');

    v_line_sub := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.subtotal - v_prev_sub
                       else round(v_source.subtotal * v_qty / v_source.quantity_in_base, 2) end;
    v_line_tax := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.tax_amount - v_prev_tax
                       else round(v_source.tax_amount * v_qty / v_source.quantity_in_base, 2) end;

    v_return_item_id := gen_random_uuid();
    insert into public.return_items(
      id, return_id, product_id, transaction_item_id, quantity_in_base,
      refund_subtotal, refund_tax_amount, refund_total,
      condition, is_restocked
    ) values (
      v_return_item_id, v_return_id, v_source.product_id, v_source.id, v_qty,
      v_line_sub, v_line_tax, v_line_sub + v_line_tax,
      'good', false
    );
  end loop;

  return jsonb_build_object(
    'return_id', v_return_id,
    'status', 'pending_approval',
    'refund_subtotal', v_sub,
    'refund_tax_amount', v_tax,
    'refund_total', v_sub + v_tax
  );
end;
$$;

revoke all on function public.request_customer_return(uuid, uuid, public.payment_method, text, jsonb) from public, anon, authenticated;
grant execute on function public.request_customer_return(uuid, uuid, public.payment_method, text, jsonb) to service_role;

-- 6. RPC: approve_customer_return
create or replace function public.approve_customer_return(
  p_employee_id uuid,
  p_return_id uuid,
  p_admin_notes text,
  p_item_conditions jsonb default null,
  p_confirm_refund boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_return public.returns%rowtype;
  v_business_date date;
  v_sequence integer;
  v_return_number text;
  v_item record;
  v_cond_item jsonb;
  v_cond text;
  v_alloc record;
  v_available integer;
  v_remaining integer;
  v_take integer;
  v_next_status text;
  v_next_refund_status text;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  if nullif(btrim(coalesce(p_admin_notes, '')), '') is null then
    raise exception 'ADMIN_NOTES_REQUIRED';
  end if;

  select * into v_return from public.returns where id = p_return_id for update;
  if not found then raise exception 'RETURN_NOT_FOUND'; end if;
  if v_return.source <> 'customer' or v_return.status <> 'pending_approval' then
    raise exception 'INVALID_RETURN_STATE';
  end if;

  -- Generate sequential return number (RET-YYYYMMDD-XXXX)
  v_business_date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  insert into public.return_sequences(business_date, last_number)
  values (v_business_date, 1)
  on conflict (business_date) do update set last_number = public.return_sequences.last_number + 1
  returning last_number into v_sequence;

  v_return_number := 'RET-' || to_char(v_business_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  -- Update item conditions if specified by admin
  if p_item_conditions is not null and jsonb_typeof(p_item_conditions) = 'array' then
    for v_cond_item in select value from jsonb_array_elements(p_item_conditions) loop
      v_cond := coalesce(v_cond_item->>'condition', 'good');
      if v_cond not in ('good', 'damaged', 'expired') then v_cond := 'good'; end if;
      update public.return_items
      set condition = v_cond
      where id = (v_cond_item->>'return_item_id')::uuid and return_id = p_return_id;
    end loop;
  end if;

  if p_confirm_refund then
    v_next_status := 'completed';
    v_next_refund_status := 'completed';

    -- Restock only sellable goods ('good') into return_item_batches & product_batches
    for v_item in select * from public.return_items where return_id = p_return_id loop
      if v_item.condition = 'good' and not v_item.is_restocked then
        v_remaining := v_item.quantity_in_base;
        for v_alloc in
          select tib.* from public.transaction_item_batches tib
          join public.product_batches pb on pb.id = tib.batch_id
          where tib.transaction_item_id = v_item.transaction_item_id
          order by pb.expired_date, pb.created_at, pb.id
        loop
          select v_alloc.quantity_in_base - coalesce(sum(rib.quantity_in_base), 0) into v_available
          from public.return_item_batches rib
          join public.return_items ri on ri.id = rib.return_item_id
          join public.returns r on r.id = ri.return_id
          where ri.transaction_item_id = v_item.transaction_item_id
            and rib.batch_id = v_alloc.batch_id
            and r.source = 'customer'
            and r.status in ('approved', 'completed');

          v_available := coalesce(v_available, v_alloc.quantity_in_base);
          if v_available > 0 and v_remaining > 0 then
            v_take := least(v_available, v_remaining);
            insert into public.return_item_batches(
              return_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot
            ) values (
              v_item.id, v_item.product_id, v_alloc.batch_id, v_take, v_alloc.cost_price_snapshot
            );
            update public.product_batches
            set quantity = quantity + v_take
            where id = v_alloc.batch_id;
            v_remaining := v_remaining - v_take;
          end if;
        end loop;

        update public.return_items
        set is_restocked = true,
            restocked_at = clock_timestamp(),
            restocked_by = p_employee_id
        where id = v_item.id;
      end if;
    end loop;

    update public.returns
    set return_number = v_return_number,
        status = v_next_status,
        refund_status = v_next_refund_status,
        reviewed_by = p_employee_id,
        reviewed_at = clock_timestamp(),
        admin_notes = btrim(p_admin_notes),
        refund_confirmed_at = clock_timestamp(),
        refund_confirmed_by = p_employee_id
    where id = p_return_id;
  else
    v_next_status := 'approved';
    v_next_refund_status := 'pending';

    update public.returns
    set return_number = v_return_number,
        status = v_next_status,
        refund_status = v_next_refund_status,
        reviewed_by = p_employee_id,
        reviewed_at = clock_timestamp(),
        admin_notes = btrim(p_admin_notes)
    where id = p_return_id;
  end if;

  return jsonb_build_object(
    'return_id', p_return_id,
    'return_number', v_return_number,
    'status', v_next_status,
    'refund_status', v_next_refund_status,
    'refund_total', v_return.refund_total
  );
end;
$$;

revoke all on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) to service_role;

-- 7. RPC: reject_customer_return
create or replace function public.reject_customer_return(
  p_employee_id uuid,
  p_return_id uuid,
  p_admin_notes text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_return public.returns%rowtype;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  if nullif(btrim(coalesce(p_admin_notes, '')), '') is null then
    raise exception 'ADMIN_NOTES_REQUIRED';
  end if;

  select * into v_return from public.returns where id = p_return_id for update;
  if not found then raise exception 'RETURN_NOT_FOUND'; end if;
  if v_return.source <> 'customer' or v_return.status <> 'pending_approval' then
    raise exception 'INVALID_RETURN_STATE';
  end if;

  update public.returns
  set status = 'rejected',
      reviewed_by = p_employee_id,
      reviewed_at = clock_timestamp(),
      admin_notes = btrim(p_admin_notes)
  where id = p_return_id;

  return jsonb_build_object(
    'return_id', p_return_id,
    'status', 'rejected',
    'admin_notes', btrim(p_admin_notes)
  );
end;
$$;

revoke all on function public.reject_customer_return(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_customer_return(uuid, uuid, text) to service_role;

-- 8. RPC: complete_customer_return (Restock sellable goods & confirm refund paid)
create or replace function public.complete_customer_return(
  p_employee_id uuid,
  p_return_id uuid,
  p_item_conditions jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_return public.returns%rowtype;
  v_cond_item jsonb;
  v_cond text;
  v_item record;
  v_alloc record;
  v_available integer;
  v_remaining integer;
  v_take integer;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  select * into v_return from public.returns where id = p_return_id for update;
  if not found then raise exception 'RETURN_NOT_FOUND'; end if;
  if v_return.source <> 'customer' or v_return.status <> 'approved' then
    raise exception 'INVALID_RETURN_STATE';
  end if;

  -- Update conditions if specified
  if p_item_conditions is not null and jsonb_typeof(p_item_conditions) = 'array' then
    for v_cond_item in select value from jsonb_array_elements(p_item_conditions) loop
      v_cond := coalesce(v_cond_item->>'condition', 'good');
      if v_cond not in ('good', 'damaged', 'expired') then v_cond := 'good'; end if;
      update public.return_items
      set condition = v_cond
      where id = (v_cond_item->>'return_item_id')::uuid and return_id = p_return_id;
    end loop;
  end if;

  -- Restock only sellable goods ('good') into return_item_batches & product_batches
  for v_item in select * from public.return_items where return_id = p_return_id loop
    if v_item.condition = 'good' and not v_item.is_restocked then
      v_remaining := v_item.quantity_in_base;
      for v_alloc in
        select tib.* from public.transaction_item_batches tib
        join public.product_batches pb on pb.id = tib.batch_id
        where tib.transaction_item_id = v_item.transaction_item_id
        order by pb.expired_date, pb.created_at, pb.id
      loop
        select v_alloc.quantity_in_base - coalesce(sum(rib.quantity_in_base), 0) into v_available
        from public.return_item_batches rib
        join public.return_items ri on ri.id = rib.return_item_id
        join public.returns r on r.id = ri.return_id
        where ri.transaction_item_id = v_item.transaction_item_id
          and rib.batch_id = v_alloc.batch_id
          and r.source = 'customer'
          and r.status in ('approved', 'completed');

        v_available := coalesce(v_available, v_alloc.quantity_in_base);
        if v_available > 0 and v_remaining > 0 then
          v_take := least(v_available, v_remaining);
          insert into public.return_item_batches(
            return_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot
          ) values (
            v_item.id, v_item.product_id, v_alloc.batch_id, v_take, v_alloc.cost_price_snapshot
          );
          update public.product_batches
          set quantity = quantity + v_take
          where id = v_alloc.batch_id;
          v_remaining := v_remaining - v_take;
        end if;
      end loop;

      update public.return_items
      set is_restocked = true,
          restocked_at = clock_timestamp(),
          restocked_by = p_employee_id
      where id = v_item.id;
    end if;
  end loop;

  update public.returns
  set status = 'completed',
      refund_status = 'completed',
      refund_confirmed_at = clock_timestamp(),
      refund_confirmed_by = p_employee_id
  where id = p_return_id;

  return jsonb_build_object(
    'return_id', p_return_id,
    'status', 'completed',
    'refund_status', 'completed',
    'refund_total', v_return.refund_total
  );
end;
$$;

revoke all on function public.complete_customer_return(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_customer_return(uuid, uuid, jsonb) to service_role;

commit;
