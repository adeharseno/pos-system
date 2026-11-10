-- 0065_simplify_return_approval_and_cashier_permission.sql
-- 1. Grant return permissions to cashier role (kasir can request return and view status)
insert into public.role_permissions (role, permission_code)
values
  ('kasir', 'returns.create'),
  ('kasir', 'returns.view')
on conflict (role, permission_code) do nothing;

-- Ensure service_role has required privileges on return tables
grant select, insert, update on public.return_sequences to service_role;
grant select, insert, update on public.returns to service_role;
grant select, insert, update on public.return_items to service_role;
grant select, insert, update on public.return_item_batches to service_role;

-- 2. Update approve_customer_return RPC to automatically restore stock and complete refund
create or replace function public.approve_customer_return(
  p_employee_id uuid,
  p_return_id uuid,
  p_admin_notes text default null,
  p_item_conditions jsonb default null,
  p_confirm_refund boolean default true
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
  v_alloc record;
  v_available integer;
  v_remaining integer;
  v_take integer;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
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

  -- Automatically restore stock for all approved items to original batches
  for v_item in select * from public.return_items where return_id = p_return_id loop
    if not v_item.is_restocked then
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

      if v_remaining <> 0 then
        raise exception 'INVALID_ORIGINAL_ALLOCATION';
      end if;

      update public.return_items
      set condition = 'good',
          is_restocked = true,
          restocked_at = clock_timestamp(),
          restocked_by = p_employee_id
      where id = v_item.id;
    end if;
  end loop;

  update public.returns
  set return_number = v_return_number,
      status = 'approved',
      refund_status = 'completed',
      reviewed_by = p_employee_id,
      reviewed_at = clock_timestamp(),
      admin_notes = btrim(coalesce(p_admin_notes, 'Disetujui')),
      refund_confirmed_at = clock_timestamp(),
      refund_confirmed_by = p_employee_id
  where id = p_return_id;

  return jsonb_build_object(
    'return_id', p_return_id,
    'return_number', v_return_number,
    'status', 'approved',
    'refund_status', 'completed',
    'refund_total', v_return.refund_total
  );
end;
$$;

revoke all on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) to service_role;
