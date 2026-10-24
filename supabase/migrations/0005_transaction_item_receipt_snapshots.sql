-- M2.7.1: immutable customer-facing receipt labels.
--
-- Existing rows receive the best label available at migration time. Their
-- original transaction-time labels cannot be reconstructed if master data had
-- already been renamed before this migration.

alter table public.transaction_items
  add column product_name_snapshot text,
  add column unit_name_snapshot text;

update public.transaction_items as ti
set
  product_name_snapshot = p.name,
  unit_name_snapshot = pu.unit_name
from public.products as p,
     public.product_units as pu
where p.id = ti.product_id
  and pu.id = ti.product_unit_id
  and pu.product_id = ti.product_id
  and (ti.product_name_snapshot is null or ti.unit_name_snapshot is null);

do $$
begin
  if exists (
    select 1
    from public.transaction_items
    where product_name_snapshot is null
       or unit_name_snapshot is null
  ) then
    raise exception 'TRANSACTION_ITEM_RECEIPT_SNAPSHOT_BACKFILL_FAILED';
  end if;
end;
$$;

alter table public.transaction_items
  alter column product_name_snapshot set not null,
  alter column unit_name_snapshot set not null;

create or replace function public.checkout_transaction(
  p_employee_id uuid,
  p_cash_drawer_session_id uuid,
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
  v_drawer record;
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

  select id, employee_id, is_open into v_drawer
  from public.cash_drawer_sessions where id = p_cash_drawer_session_id for update;
  if not found or not v_drawer.is_open or v_drawer.employee_id <> p_employee_id then
    raise exception 'NO_ACTIVE_CASH_DRAWER';
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
    id, invoice_number, business_date, cashier_id, cash_drawer_session_id,
    subtotal, tax_amount, total_amount, payment_method, cash_received, cash_change,
    payment_confirmed_at, payment_confirmed_by, status
  ) values (
    v_transaction_id, v_invoice_number, v_business_date, p_employee_id, p_cash_drawer_session_id,
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
      conversion_to_base_snapshot, quantity_in_base, unit_price, tax_rate_snapshot,
      subtotal, tax_amount, total_amount
    ) values (
      v_transaction_item_id, v_transaction_id, v_unit.product_id, v_unit.unit_id,
      v_unit.product_name, v_unit.unit_name, v_quantity,
      v_unit.conversion_to_base, v_quantity_base, v_unit.selling_price, v_unit.tax_rate,
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
