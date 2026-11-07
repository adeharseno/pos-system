begin;

alter table public.product_batches
  alter column expired_date drop not null;

alter table public.product_batches
  drop constraint product_batches_product_id_batch_number_expired_date_key;

alter table public.product_batches
  add constraint product_batches_product_id_batch_number_expired_date_key
  unique nulls not distinct (product_id, batch_number, expired_date);

drop index if exists public.idx_batches_fefo;
create index idx_batches_fefo
  on public.product_batches(product_id, expired_date asc nulls last, created_at, id)
  where quantity > 0;

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
    'status', v_status, 'subtotal', v_subtotal, 'tax_amount', v_tax, 'total_amount', v_total,
    'cash_change', case when p_payment_method = 'cash' then p_cash_received - v_total else null end);
end;
$$;

create or replace function public.dashboard_low_stock(p_business_date date) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  with available as (
    select b.product_id, sum(b.quantity)::bigint as quantity
    from public.product_batches b
    where b.quantity>0 and (b.expired_date is null or b.expired_date>=p_business_date)
    group by b.product_id
  ), problem as (
    select p.id,p.name,p.base_unit,p.minimum_stock,coalesce(a.quantity,0) as available_stock,
      case when coalesce(a.quantity,0)=0 then 'out' else 'low' end as stock_status
    from public.products p left join available a on a.product_id=p.id
    where p.is_active and (coalesce(a.quantity,0)=0 or (coalesce(a.quantity,0)>0 and coalesce(a.quantity,0)<p.minimum_stock))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'baseUnit',base_unit,'availableStock',available_stock::text,
    'minimumStock',minimum_stock,'status',stock_status)
    order by case stock_status when 'out' then 0 else 1 end,available_stock,name,id),'[]'::jsonb)
  from problem;
$$;

create or replace function public.product_performance_report(p_from date, p_to date, p_sort text default 'quantity')
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
  with sales as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.subtotal) as revenue
    from public.transactions t join public.transaction_items i on i.transaction_id = t.id
    where t.status = 'completed' and (
      (t.payment_method = 'cash' and t.business_date between p_from and p_to)
      or (t.payment_method <> 'cash'
        and t.payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
        and t.payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')))
    group by i.product_id
  ), refunds as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.refund_subtotal) as revenue
    from public.returns r join public.return_items i on i.return_id = r.id
    where r.source = 'customer' and r.business_date between p_from and p_to
    group by i.product_id
  ), stock as (
    select product_id, sum(quantity) as quantity from public.product_batches
    where quantity > 0 and (expired_date is null or expired_date >= (now() at time zone 'Asia/Jakarta')::date)
    group by product_id
  ), performance as (
    select p.id, p.name, p.sku, coalesce(s.quantity, 0) as sold,
      coalesce(r.quantity, 0) as returned, coalesce(s.quantity, 0) - coalesce(r.quantity, 0) as net_quantity,
      coalesce(s.revenue, 0) - coalesce(r.revenue, 0) as net_revenue
    from public.products p left join sales s on s.product_id = p.id
      left join refunds r on r.product_id = p.id
    where s.product_id is not null or r.product_id is not null
  ), unsold as (
    select p.id, p.name, p.sku, p.base_unit, coalesce(st.quantity, 0) as available_stock
    from public.products p left join sales s on s.product_id = p.id
      left join stock st on st.product_id = p.id
    where p.is_active and s.product_id is null
  )
  select jsonb_build_object(
    'bestSelling', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'quantitySold', sold::text,
      'returnedQuantity', returned::text, 'netQuantity', net_quantity::text,
      'netRevenue', round(net_revenue, 2)::text)
      order by case when p_sort = 'revenue' then net_revenue else net_quantity end desc, name, id)
      from performance), '[]'::jsonb),
    'unsold', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'baseUnit', base_unit,
      'availableStock', available_stock::text, 'hasStock', available_stock > 0)
      order by (available_stock > 0) desc, name, id) from unsold), '[]'::jsonb)
  );
$$;

create or replace function public.stock_list_read_model(
  p_business_date date,
  p_query text default '',
  p_active_status text default 'all',
  p_prescription_status text default 'all',
  p_stock_status text default 'all',
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_offset integer;
  v_result jsonb;
begin
  if p_business_date is null then raise exception 'business date is required' using errcode = '22023'; end if;
  if length(v_query) > 80 then raise exception 'query is too long' using errcode = '22023'; end if;
  if p_active_status not in ('all', 'active', 'inactive') then raise exception 'invalid active status' using errcode = '22023'; end if;
  if p_prescription_status not in ('all', 'required', 'non_prescription') then raise exception 'invalid prescription status' using errcode = '22023'; end if;
  if p_stock_status not in ('all', 'out', 'low', 'normal', 'needs_restock') then raise exception 'invalid stock status' using errcode = '22023'; end if;
  if p_sort not in ('name_asc', 'stock_asc', 'stock_desc', 'expiry_asc') then raise exception 'invalid sort' using errcode = '22023'; end if;
  if p_page < 1 or p_page > 10000 then raise exception 'invalid page' using errcode = '22023'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  v_offset := (p_page - 1) * p_limit;

  with candidate_products as (
    select p.* from products p
    where (p_active_status = 'all' or p.is_active = (p_active_status = 'active'))
      and (p_prescription_status = 'all' or p.requires_prescription = (p_prescription_status = 'required'))
      and (v_query = '' or p.name ilike '%' || v_query || '%' or p.sku ilike '%' || v_query || '%'
        or exists (select 1 from product_units pu where pu.product_id = p.id and pu.barcode = v_query))
  ), batch_totals as (
    select pb.product_id, sum(pb.quantity)::integer as available_stock, min(pb.expired_date) as nearest_expiry
    from product_batches pb
    join candidate_products p on p.id = pb.product_id
    where pb.quantity > 0 and (pb.expired_date is null or pb.expired_date >= p_business_date)
    group by pb.product_id
  ), unit_totals as (
    select pu.product_id, count(*)::integer as unit_count,
      max(pu.selling_price) filter (where pu.is_base_unit) as base_selling_price
    from product_units pu
    join candidate_products p on p.id = pu.product_id
    group by pu.product_id
  ), base as (
    select p.id, p.sku, p.name, p.generic_name, p.manufacturer, p.base_unit,
      p.requires_prescription, p.is_active,
      coalesce(c.name, '—') as category,
      coalesce(sc.name, '—') as subcategory,
      s.name as default_supplier,
      sl.full_code as storage_location,
      coalesce(u.unit_count, 0) as unit_count,
      coalesce(b.available_stock, 0) as available_stock,
      p.minimum_stock,
      case
        when coalesce(b.available_stock, 0) = 0 then 'out'
        when coalesce(b.available_stock, 0) <= p.minimum_stock then 'low'
        else 'normal'
      end as stock_status,
      b.nearest_expiry,
      u.base_selling_price
    from candidate_products p
    left join batch_totals b on b.product_id = p.id
    left join unit_totals u on u.product_id = p.id
    left join categories c on c.id = p.category_id
    left join subcategories sc on sc.id = p.subcategory_id
    left join suppliers s on s.id = p.default_supplier_id
    left join storage_locations sl on sl.id = p.storage_location_id
  ), matched as (
    select *
    from base
    where p_stock_status = 'all'
      or stock_status = p_stock_status
      or (p_stock_status = 'needs_restock' and stock_status in ('out', 'low'))
  ), paged as (
    select * from matched
    order by
      case when p_sort = 'stock_asc' then case stock_status when 'out' then 0 when 'low' then 1 else 2 end end,
      case when p_sort = 'stock_asc' then available_stock end asc,
      case when p_sort = 'stock_desc' then available_stock end desc,
      case when p_sort = 'expiry_asc' then nearest_expiry end asc nulls last,
      case when p_sort = 'name_asc' then lower(name) end asc,
      lower(name) asc, id asc
    limit p_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'sku', sku, 'name', name, 'genericName', generic_name,
      'manufacturer', manufacturer, 'baseUnit', base_unit,
      'requiresPrescription', requires_prescription, 'isActive', is_active,
      'category', category, 'subcategory', subcategory,
      'defaultSupplier', default_supplier, 'storageLocation', storage_location,
      'unitCount', unit_count, 'availableStock', available_stock,
      'minimumStock', minimum_stock, 'stockStatus', stock_status,
      'nearestExpiry', nearest_expiry, 'baseSellingPrice', base_selling_price
    ) order by
      case when p_sort = 'stock_asc' then case stock_status when 'out' then 0 when 'low' then 1 else 2 end end,
      case when p_sort = 'stock_asc' then available_stock end asc,
      case when p_sort = 'stock_desc' then available_stock end desc,
      case when p_sort = 'expiry_asc' then nearest_expiry end asc nulls last,
      case when p_sort = 'name_asc' then lower(name) end asc,
      lower(name) asc, id asc) from paged), '[]'::jsonb),
    'total', (select count(*) from matched)
  ) into v_result;
  return v_result;
end;
$$;

commit;
