-- Migration 0067: Permanently disable POS sales tax across checkout and purchase receiving.
-- 1. Ensures all master products have is_taxable = false.
-- 2. Updates public.checkout_transaction so sales tax is always 0 regardless of product flags/rates.
-- 3. Updates public.finalize_purchase_receiving so supplier purchase tax (tax_rate & HPP/cost_price)
--    is preserved without re-enabling sales tax (products.is_taxable remains false).

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

update public.products
set is_taxable = false
where is_taxable is distinct from false;

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
  v_subtotal numeric(14,2) := 0;
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
           u.id as unit_id, u.conversion_to_base, u.selling_price
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
    v_subtotal := v_subtotal + v_line_subtotal;
    v_requires_prescription := v_requires_prescription or v_unit.requires_prescription;
  end loop;

  if v_requires_prescription and (
    p_prescription is null or jsonb_typeof(p_prescription) <> 'object'
    or btrim(coalesce(p_prescription->>'doctor_name', '')) = ''
    or btrim(coalesce(p_prescription->>'patient_name', '')) = ''
  ) then raise exception 'PRESCRIPTION_REQUIRED'; end if;

  -- Keep the existing deterministic lock order; unknown expiry sorts last.
  perform 1 from public.product_batches pb
  where pb.product_id in (
    select distinct u.product_id from public.product_units u
    where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
  ) and pb.quantity > 0
    and (pb.expired_date is null or pb.expired_date >= v_business_date)
  order by pb.product_id, pb.expired_date asc nulls last, pb.created_at, pb.id
  for update;

  if exists (
    select 1 from public.stock_opname_items oi
    join public.stock_opname_sessions os on os.id = oi.session_id and os.status = 'in_progress'
    join public.product_batches pb on pb.id = oi.batch_id
    where pb.product_id in (
      select distinct u.product_id from public.product_units u
      where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
    ) and pb.quantity > 0
      and (pb.expired_date is null or pb.expired_date >= v_business_date)
  ) then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  for v_batch in
    select u.product_id, sum((e.value->>'quantity')::integer * u.conversion_to_base)::integer needed
    from jsonb_array_elements(p_items) e(value)
    join public.product_units u on u.id = (e.value->>'product_unit_id')::uuid
    group by u.product_id order by u.product_id
  loop
    if coalesce((select sum(quantity) from public.product_batches
      where product_id = v_batch.product_id and quantity > 0
        and (expired_date is null or expired_date >= v_business_date)), 0) < v_batch.needed then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  -- Sales tax is permanently disabled; transaction total equals subtotal.
  v_total := v_subtotal;
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
    v_subtotal, 0, v_total, p_payment_method,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' then p_cash_received - v_total else null end,
    case when p_payment_method = 'cash' then clock_timestamp() else null end,
    case when p_payment_method = 'cash' then p_employee_id else null end, v_status
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select p.id as product_id, p.name as product_name,
           u.id as unit_id, u.unit_name, u.conversion_to_base, u.selling_price into v_unit
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = (v_item->>'product_unit_id')::uuid;
    v_quantity_base := v_quantity * v_unit.conversion_to_base;
    v_line_subtotal := round(v_quantity * v_unit.selling_price, 2);
    v_transaction_item_id := gen_random_uuid();
    insert into public.transaction_items(
      id, transaction_id, product_id, product_unit_id, product_name_snapshot,
      unit_name_snapshot, quantity_in_unit,
      conversion_to_base_snapshot, quantity_in_base, unit_price, discount_amount, tax_rate_snapshot,
      subtotal, tax_amount, total_amount
    ) values (
      v_transaction_item_id, v_transaction_id, v_unit.product_id, v_unit.unit_id,
      v_unit.product_name, v_unit.unit_name, v_quantity,
      v_unit.conversion_to_base, v_quantity_base, v_unit.selling_price, 0, 0,
      v_line_subtotal, 0, v_line_subtotal
    );
    v_remaining := v_quantity_base;
    for v_batch in select id, quantity, cost_price from public.product_batches
      where product_id = v_unit.product_id and quantity > 0
        and (expired_date is null or expired_date >= v_business_date)
      order by expired_date asc nulls last, created_at, id
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
    'status', v_status, 'subtotal', v_subtotal, 'tax_amount', 0, 'total_amount', v_total,
    'cash_change', case when p_payment_method = 'cash' then p_cash_received - v_total else null end);
end;
$$;

revoke all on function public.checkout_transaction(
  uuid, public.payment_method, jsonb, numeric, jsonb
) from public, anon, authenticated;

grant execute on function public.checkout_transaction(
  uuid, public.payment_method, jsonb, numeric, jsonb
) to service_role;

create or replace function public.finalize_purchase_receiving(
  p_invoice_id uuid,
  p_employee_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_token text,
  p_acknowledge_difference boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  h public.purchase_invoices;
  r public.purchase_invoice_requests;
  g record;
  b public.product_batches;
  p public.products;
  u public.product_units;
  plan jsonb;
  line jsonb;
  i public.purchase_invoice_items;
  fingerprint jsonb;
  history jsonb := '[]'::jsonb;
  batch_id uuid;
  target_unit uuid;
  created_unit boolean;
  before_price numeric;
  base_cost numeric;
  new_batch_cost numeric;
begin
  perform 1 from public.employees where id=p_employee_id and is_active and position='owner_admin' for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_invoice_id is null or p_request_id is null or p_expected_version is null or p_token is null or p_acknowledge_difference is null then raise exception 'INVALID_RECEIVING_ITEM'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,240024));
  select * into h from public.purchase_invoices where id=p_invoice_id for update;
  if not found then raise exception 'PURCHASE_INVOICE_NOT_FOUND'; end if;
  fingerprint:=jsonb_build_object('kind','finalize','version',p_expected_version,'token',p_token,'acknowledge_difference',p_acknowledge_difference);
  select * into r from public.purchase_invoice_requests where request_id=p_request_id;
  if found then
    if r.invoice_id<>h.id or r.employee_id<>p_employee_id or r.payload<>fingerprint then raise exception 'INVOICE_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('id',h.id,'status','completed','replayed',true);
  end if;
  if h.status<>'draft' then raise exception 'INVOICE_ALREADY_COMPLETED'; end if;
  if h.version<>p_expected_version then raise exception 'INVOICE_RECEIVING_CHANGED'; end if;
  perform pg_advisory_xact_lock(73194001);
  if exists(select 1 from public.stock_opname_sessions where status='in_progress') then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;
  perform 1 from public.products where id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null) order by id for no key update;
  perform 1 from public.product_units where product_id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null) order by product_id,id for update;
  perform 1 from public.product_batches where product_id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null)
    order by product_id,expired_date asc nulls last,created_at,id for update;
  plan:=public.purchase_receiving_plan(h.id);
  if plan->>'token'<>p_token then raise exception 'INVOICE_RECEIVING_CHANGED'; end if;
  if (plan->>'difference')::numeric<>0 and not p_acknowledge_difference then raise exception 'INVOICE_DIFFERENCE_NOT_CONFIRMED'; end if;

  for g in select product_id,batch_number,expired_date,sum(quantity::bigint*conversion_to_base) as qty,sum(cost_price*quantity) as cost,
      (array_agg(id order by created_at,id))[1] as item_id
    from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null
    group by product_id,batch_number,expired_date order by product_id,expired_date asc nulls last,batch_number loop
    if g.qty>2147483647 then raise exception 'INVALID_RECEIVING_ITEM'; end if;
    select * into b from public.product_batches
      where product_id=g.product_id and batch_number=g.batch_number and expired_date is not distinct from g.expired_date
      for update;
    if found then
      if b.quantity::bigint+g.qty>2147483647 then raise exception 'INVALID_RECEIVING_ITEM'; end if;
      new_batch_cost:=round((b.quantity*b.cost_price+g.cost)/(b.quantity+g.qty),2);
      update public.product_batches set quantity=quantity+g.qty,cost_price=new_batch_cost where id=b.id;
      batch_id:=b.id;
    else
      new_batch_cost:=round(g.cost/g.qty,2);
      perform public.receive_product_stock(p_employee_id,g.product_id,jsonb_build_array(jsonb_build_object('batch_number',g.batch_number,'expired_date',g.expired_date,'quantity',g.qty,'cost_price',new_batch_cost)));
      select id into batch_id from public.product_batches
        where product_id=g.product_id and batch_number=g.batch_number and expired_date is not distinct from g.expired_date;
      update public.product_batches set purchase_invoice_item_id=g.item_id where id=batch_id;
    end if;
    history:=history||jsonb_build_array(jsonb_build_object('batch_id',batch_id,'product_id',g.product_id,'batch_number',g.batch_number,'expired_date',g.expired_date,
      'previous_quantity',coalesce(b.quantity,0),'previous_cost',b.cost_price,'received_quantity',g.qty,'received_cost',g.cost,'new_cost',new_batch_cost));
  end loop;

  for line in select value from jsonb_array_elements(plan->'items') loop
    select * into i from public.purchase_invoice_items where id=(line->'item'->>'id')::uuid;
    select * into p from public.products where id=i.product_id;
    target_unit:=(line->>'target_unit_id')::uuid; created_unit:=false;
    if target_unit is null then
      select * into u from public.product_units where product_id=i.product_id and is_base_unit for update;
      if not found then
        insert into public.product_units(product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
        values(i.product_id,i.base_unit_snapshot,1,i.selling_price,true) on conflict do nothing returning * into u;
        if not found then raise exception 'INVOICE_RECEIVING_CHANGED'; end if;
        created_unit:=true;
      end if;
      target_unit:=u.id;
    else
      select * into u from public.product_units where id=target_unit;
      if i.product_unit_id is null and not u.is_base_unit then update public.product_units set is_base_unit=true where id=u.id; end if;
    end if;
    before_price:=case when created_unit then null else u.selling_price end;
    base_cost:=(line->>'base_cost')::numeric;
    -- Preserve supplier tax_rate and base_cost (HPP), while never enabling POS sales tax.
    update public.products set cost_price=base_cost,tax_rate=i.tax_rate,is_taxable=false where id=i.product_id;
    update public.product_units set selling_price=i.selling_price where id=target_unit;
    select id into batch_id from public.product_batches
      where product_id=i.product_id and batch_number=i.batch_number and expired_date is not distinct from i.expired_date;
    insert into public.purchase_invoice_receipts(item_id,invoice_id,product_id,product_unit_id,batch_id,quantity_base,cost_price_base,previous_cost_price,new_cost_price,previous_selling_price,new_selling_price,previous_tax_rate,new_tax_rate,created_base_unit)
    values(i.id,h.id,i.product_id,target_unit,batch_id,i.quantity*i.conversion_to_base,base_cost,p.cost_price,base_cost,before_price,i.selling_price,p.tax_rate,i.tax_rate,created_unit);
  end loop;
  update public.purchase_invoices set status='completed',completed_at=clock_timestamp(),completed_by=p_employee_id,
    finalization_snapshot=plan||jsonb_build_object('batch_actions',history),version=version+1,updated_by=p_employee_id,updated_at=clock_timestamp() where id=h.id;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,h.id,fingerprint,p_employee_id);
  return jsonb_build_object('id',h.id,'status','completed','replayed',false);
end;
$$;

revoke all on function public.finalize_purchase_receiving(
  uuid, uuid, uuid, integer, text, boolean
) from public, anon, authenticated;

grant execute on function public.finalize_purchase_receiving(
  uuid, uuid, uuid, integer, text, boolean
) to service_role;

commit;

