BEGIN;

-- ---------------------------------------------------------------------------
-- Remove the cash-drawer feature entirely and replace its reconciliation role
-- with a read-only transaction log. Sales/returns keep every non-drawer rule
-- (FEFO, invoice sequence, opname re-check, atomicity) intact.
-- ---------------------------------------------------------------------------

-- 1. Immutable per-line discount snapshot (the only missing line field).
alter table public.transaction_items
  add column if not exists discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0);

-- 2. Drop drawer references from transactions and returns.
--    "drop ... if exists" keeps this safe whether or not the column already
--    became nullable in an earlier manual run.
alter table public.transactions drop constraint if exists transactions_cash_drawer_session_id_fkey;
alter table public.transactions drop column if exists cash_drawer_session_id;

alter table public.returns drop constraint if exists returns_cash_drawer_session_id_fkey;
alter table public.returns drop constraint if exists chk_return_source_refund_shape;
alter table public.returns drop column if exists cash_drawer_session_id;
alter table public.returns add constraint chk_return_source_refund_shape check (
  (source = 'customer' and transaction_id is not null and refund_method in ('cash', 'qris'))
  or (source = 'supplier' and transaction_id is null and refund_method is null)
);

-- 3. Drop the drawer lifecycle RPCs and table.
drop function if exists public.open_cash_drawer(uuid, numeric);
drop function if exists public.close_cash_drawer(uuid, uuid, numeric);
drop table if exists public.cash_drawer_sessions cascade;

-- 4. Checkout without any drawer precondition. FEFO, invoice sequence, opname
--    re-check and atomicity are unchanged.
drop function if exists public.checkout_transaction(uuid, uuid, public.payment_method, jsonb, numeric, jsonb);
create or replace function public.checkout_transaction(
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_unit record;
  v_batch record;
  v_employee record;
  v_transaction_id uuid := gen_random_uuid();
  v_transaction_item_id uuid;
  v_business_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_invoice_sequence integer;
  v_invoice_number text;
  v_quantity integer;
  v_quantity_base integer;
  v_remaining integer;
  v_take integer;
  v_line_subtotal numeric(14,2);
  v_line_tax numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_total numeric(14,2);
  v_requires_prescription boolean := false;
  v_status public.transaction_status;
begin
  select id, position, is_active into v_employee
  from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_CART';
  end if;

  -- Validate JSON before casts, then lock price/unit rows deterministically.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'product_unit_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_CART';
    end if;
  end loop;

  perform 1
  from public.product_units u
  join public.products p on p.id = u.product_id
  where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
  order by p.id, u.id
  for share of p, u;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select p.id as product_id, p.is_active, p.requires_prescription,
           p.is_taxable, p.tax_rate, u.id as unit_id,
           u.conversion_to_base, u.selling_price
      into v_unit
    from public.product_units u
    join public.products p on p.id = u.product_id
    where u.id = (v_item->>'product_unit_id')::uuid;
    if not found or not v_unit.is_active then
      raise exception 'INVALID_PRODUCT_UNIT';
    end if;
    v_quantity_base := v_quantity * v_unit.conversion_to_base;
    if v_quantity_base <= 0 then raise exception 'INVALID_CART'; end if;
    v_line_subtotal := round(v_quantity * v_unit.selling_price, 2);
    v_line_tax := case when v_unit.is_taxable
      then round(v_line_subtotal * v_unit.tax_rate / 100, 2) else 0 end;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_requires_prescription := v_requires_prescription or v_unit.requires_prescription;
  end loop;

  if v_requires_prescription and (
    p_prescription is null or jsonb_typeof(p_prescription) <> 'object'
    or btrim(coalesce(p_prescription->>'doctor_name', '')) = ''
    or btrim(coalesce(p_prescription->>'patient_name', '')) = ''
  ) then raise exception 'PRESCRIPTION_REQUIRED'; end if;

  -- One deterministic lock set closes checkout/checkout and opname/start races.
  perform 1 from public.product_batches pb
  where pb.product_id in (
    select distinct u.product_id from public.product_units u
    where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
  ) and pb.quantity > 0 and pb.expired_date >= v_business_date
  order by pb.product_id, pb.expired_date, pb.created_at, pb.id
  for update;

  if exists (
    select 1 from public.stock_opname_items oi
    join public.stock_opname_sessions os on os.id = oi.session_id and os.status = 'in_progress'
    join public.product_batches pb on pb.id = oi.batch_id
    where pb.product_id in (
      select distinct u.product_id from public.product_units u
      where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
    ) and pb.quantity > 0 and pb.expired_date >= v_business_date
  ) then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  for v_batch in
    select u.product_id, sum((e.value->>'quantity')::integer * u.conversion_to_base)::integer needed
    from jsonb_array_elements(p_items) e(value)
    join public.product_units u on u.id = (e.value->>'product_unit_id')::uuid
    group by u.product_id order by u.product_id
  loop
    if coalesce((select sum(quantity) from public.product_batches
      where product_id = v_batch.product_id and quantity > 0 and expired_date >= v_business_date), 0) < v_batch.needed then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  v_total := v_subtotal + v_tax;
  if p_payment_method = 'cash' and (p_cash_received is null or p_cash_received < v_total) then
    raise exception 'INSUFFICIENT_CASH';
  end if;
  if p_payment_method = 'qris' and p_cash_received is not null then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;

  insert into public.invoice_sequences(business_date, last_number)
  values (v_business_date, 1)
  on conflict (business_date) do update set last_number = public.invoice_sequences.last_number + 1
  returning last_number into v_invoice_sequence;
  v_invoice_number := 'INV-' || to_char(v_business_date, 'YYYYMMDD') || '-' || lpad(v_invoice_sequence::text, 4, '0');
  v_status := case when p_payment_method = 'cash' then 'completed'::public.transaction_status
                   else 'pending_payment'::public.transaction_status end;

  insert into public.transactions(
    id, invoice_number, business_date, cashier_id,
    subtotal, tax_amount, total_amount, payment_method, cash_received, cash_change,
    payment_confirmed_at, payment_confirmed_by, status
  ) values (
    v_transaction_id, v_invoice_number, v_business_date, p_employee_id,
    v_subtotal, v_tax, v_total, p_payment_method,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' then p_cash_received - v_total else null end,
    case when p_payment_method = 'cash' then clock_timestamp() else null end,
    case when p_payment_method = 'cash' then p_employee_id else null end, v_status
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select p.id as product_id, p.name as product_name, p.is_taxable, p.tax_rate,
           u.id as unit_id, u.unit_name, u.conversion_to_base, u.selling_price into v_unit
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = (v_item->>'product_unit_id')::uuid;
    v_quantity_base := v_quantity * v_unit.conversion_to_base;
    v_line_subtotal := round(v_quantity * v_unit.selling_price, 2);
    v_line_tax := case when v_unit.is_taxable then round(v_line_subtotal * v_unit.tax_rate / 100, 2) else 0 end;
    v_transaction_item_id := gen_random_uuid();
    insert into public.transaction_items(
      id, transaction_id, product_id, product_unit_id, product_name_snapshot,
      unit_name_snapshot, quantity_in_unit,
      conversion_to_base_snapshot, quantity_in_base, unit_price, discount_amount, tax_rate_snapshot,
      subtotal, tax_amount, total_amount
    ) values (
      v_transaction_item_id, v_transaction_id, v_unit.product_id, v_unit.unit_id,
      v_unit.product_name, v_unit.unit_name, v_quantity,
      v_unit.conversion_to_base, v_quantity_base, v_unit.selling_price, 0, v_unit.tax_rate,
      v_line_subtotal, v_line_tax, v_line_subtotal + v_line_tax
    );
    v_remaining := v_quantity_base;
    for v_batch in select id, quantity, cost_price from public.product_batches
      where product_id = v_unit.product_id and quantity > 0 and expired_date >= v_business_date
      order by expired_date, created_at, id
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_batch.quantity);
      insert into public.transaction_item_batches(transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot)
      values (v_transaction_item_id, v_unit.product_id, v_batch.id, v_take, v_batch.cost_price);
      update public.product_batches set quantity = quantity - v_take where id = v_batch.id;
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;

  if v_requires_prescription then
    insert into public.transaction_prescriptions(transaction_id, prescription_number, doctor_name, patient_name, photo_url)
    values (v_transaction_id, nullif(btrim(p_prescription->>'prescription_number'), ''),
      btrim(p_prescription->>'doctor_name'), btrim(p_prescription->>'patient_name'),
      nullif(btrim(p_prescription->>'photo_url'), ''));
  end if;
  return jsonb_build_object('transaction_id', v_transaction_id, 'invoice_number', v_invoice_number,
    'status', v_status, 'subtotal', v_subtotal, 'tax_amount', v_tax, 'total_amount', v_total,
    'cash_change', case when p_payment_method = 'cash' then p_cash_received - v_total else null end);
end;
$$;

-- 5. Customer return without the "open drawer" precondition. Cash refund no
--    longer records a drawer; every other rule (cumulative quantity, batch
--    restoration, freeze re-check) is unchanged.
drop function if exists public.create_customer_return(uuid, uuid, public.payment_method, uuid, text, jsonb);
create or replace function public.create_customer_return(
  p_employee_id uuid, p_transaction_id uuid, p_refund_method public.payment_method,
  p_reason text, p_items jsonb
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_employee public.employees%rowtype; v_tx public.transactions%rowtype; v_item jsonb; v_source record; v_alloc record;
  v_return_id uuid:=gen_random_uuid(); v_return_item_id uuid; v_qty integer; v_previous integer; v_prev_sub numeric; v_prev_tax numeric;
  v_line_sub numeric; v_line_tax numeric; v_sub numeric(14,2):=0; v_tax numeric(14,2):=0; v_remaining integer; v_available integer; v_take integer;
begin
  select * into v_employee from public.employees where id=p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin','kasir') then raise exception 'INVALID_EMPLOYEE'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'RETURN_REASON_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'INVALID_RETURN_ITEMS'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' or coalesce(v_item->>'transaction_item_id','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(v_item->>'quantity_in_base','') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_RETURN_ITEMS'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct value->>'transaction_item_id') from jsonb_array_elements(p_items)) then
    raise exception 'DUPLICATE_RETURN_ITEM';
  end if;
  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  if v_tx.status<>'completed' then raise exception 'INVALID_TRANSACTION_STATE'; end if;
  perform 1 from public.transaction_items ti where ti.id in
    (select (value->>'transaction_item_id')::uuid from jsonb_array_elements(p_items))
    order by ti.id for update;
  -- Lock original allocation batches before checking the freeze.
  perform 1 from public.product_batches pb join public.transaction_item_batches tib on tib.batch_id=pb.id
    where tib.transaction_item_id in (select (value->>'transaction_item_id')::uuid from jsonb_array_elements(p_items))
    order by pb.product_id,pb.expired_date,pb.created_at,pb.id for update of pb;
  if exists(select 1 from public.transaction_item_batches tib join public.stock_opname_items oi on oi.batch_id=tib.batch_id
    join public.stock_opname_sessions os on os.id=oi.session_id
    where tib.transaction_item_id in (select (value->>'transaction_item_id')::uuid from jsonb_array_elements(p_items)) and os.status='in_progress')
    then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items where id=(v_item->>'transaction_item_id')::uuid and transaction_id=p_transaction_id;
    if not found then raise exception 'INVALID_TRANSACTION_ITEM'; end if;
    select coalesce(sum(ri.quantity_in_base),0),coalesce(sum(ri.refund_subtotal),0),coalesce(sum(ri.refund_tax_amount),0)
      into v_previous,v_prev_sub,v_prev_tax from public.return_items ri join public.returns r on r.id=ri.return_id
      where ri.transaction_item_id=v_source.id and r.source='customer';
    if v_previous+v_qty>v_source.quantity_in_base then raise exception 'RETURN_QUANTITY_EXCEEDED'; end if;
    v_line_sub:=case when v_previous+v_qty=v_source.quantity_in_base then v_source.subtotal-v_prev_sub else round(v_source.subtotal*v_qty/v_source.quantity_in_base,2) end;
    v_line_tax:=case when v_previous+v_qty=v_source.quantity_in_base then v_source.tax_amount-v_prev_tax else round(v_source.tax_amount*v_qty/v_source.quantity_in_base,2) end;
    v_sub:=v_sub+v_line_sub; v_tax:=v_tax+v_line_tax;
  end loop;
  insert into public.returns(id,source,transaction_id,refund_method,reason,processed_by,refund_subtotal,refund_tax_amount,refund_total)
  values(v_return_id,'customer',p_transaction_id,p_refund_method,btrim(p_reason),p_employee_id,v_sub,v_tax,v_sub+v_tax);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items where id=(v_item->>'transaction_item_id')::uuid;
    select coalesce(sum(ri.quantity_in_base),0),coalesce(sum(ri.refund_subtotal),0),coalesce(sum(ri.refund_tax_amount),0)
      into v_previous,v_prev_sub,v_prev_tax from public.return_items ri join public.returns r on r.id=ri.return_id
      where ri.transaction_item_id=v_source.id and r.source='customer';
    v_line_sub:=case when v_previous+v_qty=v_source.quantity_in_base then v_source.subtotal-v_prev_sub else round(v_source.subtotal*v_qty/v_source.quantity_in_base,2) end;
    v_line_tax:=case when v_previous+v_qty=v_source.quantity_in_base then v_source.tax_amount-v_prev_tax else round(v_source.tax_amount*v_qty/v_source.quantity_in_base,2) end;
    v_return_item_id:=gen_random_uuid();
    insert into public.return_items(id,return_id,product_id,transaction_item_id,quantity_in_base,refund_subtotal,refund_tax_amount,refund_total)
    values(v_return_item_id,v_return_id,v_source.product_id,v_source.id,v_qty,v_line_sub,v_line_tax,v_line_sub+v_line_tax);
    v_remaining:=v_qty;
    for v_alloc in
      select tib.* from public.transaction_item_batches tib
      join public.product_batches pb on pb.id=tib.batch_id
      where tib.transaction_item_id=v_source.id
      order by pb.expired_date,pb.created_at,pb.id
    loop
      select v_alloc.quantity_in_base-coalesce(sum(rib.quantity_in_base),0) into v_available
      from public.return_item_batches rib join public.return_items ri on ri.id=rib.return_item_id
      join public.returns r on r.id=ri.return_id where ri.transaction_item_id=v_source.id and rib.batch_id=v_alloc.batch_id and r.source='customer';
      v_available:=coalesce(v_available,v_alloc.quantity_in_base);
      if v_available>0 and v_remaining>0 then
        v_take:=least(v_available,v_remaining);
        insert into public.return_item_batches(return_item_id,product_id,batch_id,quantity_in_base,cost_price_snapshot)
        values(v_return_item_id,v_source.product_id,v_alloc.batch_id,v_take,v_alloc.cost_price_snapshot);
        update public.product_batches set quantity=quantity+v_take where id=v_alloc.batch_id;
        v_remaining:=v_remaining-v_take;
      end if;
    end loop;
    if v_remaining<>0 then raise exception 'INVALID_ORIGINAL_ALLOCATION'; end if;
  end loop;
  return jsonb_build_object('return_id',v_return_id,'refund_subtotal',v_sub,'refund_tax_amount',v_tax,'refund_total',v_sub+v_tax);
end; $$;

-- 6. Daily totals per cashier per payment method (replaces the closing-cash
--    snapshot; cash variance is intentionally dropped).
create or replace view public.daily_sales_totals as
select
  t.business_date,
  t.cashier_id,
  e.full_name as cashier_name,
  t.payment_method,
  count(*)::int as sale_count,
  coalesce(sum(t.total_amount), 0) as gross_total,
  coalesce(sum(t.total_amount) filter (where t.status = 'completed'), 0) as completed_total,
  coalesce(sum(t.total_amount) filter (where t.status = 'voided'), 0) as voided_total
from public.transactions t
join public.employees e on e.id = t.cashier_id
group by t.business_date, t.cashier_id, e.full_name, t.payment_method;

revoke all on public.daily_sales_totals from public, anon, authenticated;
grant select on public.daily_sales_totals to service_role;

revoke all on function public.checkout_transaction(uuid, public.payment_method, jsonb, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.create_customer_return(uuid, uuid, public.payment_method, text, jsonb) from public, anon, authenticated;
grant execute on function public.checkout_transaction(uuid, public.payment_method, jsonb, numeric, jsonb) to service_role;
grant execute on function public.create_customer_return(uuid, uuid, public.payment_method, text, jsonb) to service_role;

-- 7. Drop the now-unused cash_drawer.manage capability.
delete from public.role_permissions where permission_code = 'cash_drawer.manage';
delete from public.permission_definitions where code = 'cash_drawer.manage';

COMMIT;
