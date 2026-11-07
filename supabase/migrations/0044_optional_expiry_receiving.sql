begin;

alter table public.purchase_invoice_items
  alter column expired_date drop not null;

create or replace function public.receive_product_stock(
  p_employee_id uuid,
  p_product_id uuid,
  p_batches jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_business_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_expired_date date;
  v_received_date date;
  v_cost_price numeric(14,2);
  v_count integer := 0;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then raise exception 'INVALID_EMPLOYEE'; end if;

  select * into v_product from public.products where id = p_product_id for key share;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if not v_product.is_active then raise exception 'PRODUCT_INACTIVE'; end if;
  if p_batches is null or jsonb_typeof(p_batches) <> 'array' or jsonb_array_length(p_batches) = 0 then raise exception 'INVALID_BATCH'; end if;

  perform pg_advisory_xact_lock(73194001);
  if exists (select 1 from public.stock_opname_sessions where status = 'in_progress') then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  for v_item in select value from jsonb_array_elements(p_batches) loop
    if jsonb_typeof(v_item) <> 'object'
      or btrim(coalesce(v_item->>'batch_number','')) = ''
      or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
      or coalesce(v_item->>'cost_price','') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      or (v_item->>'expired_date' is not null and (v_item->>'expired_date') !~ '^\d{4}-\d{2}-\d{2}$')
      or (v_item ? 'received_date' and coalesce(v_item->>'received_date','') !~ '^\d{4}-\d{2}-\d{2}$')
    then raise exception 'INVALID_BATCH'; end if;
    begin
      v_expired_date := (v_item->>'expired_date')::date;
      v_received_date := coalesce((v_item->>'received_date')::date, v_business_date);
    exception when others then raise exception 'INVALID_BATCH'; end;
    if v_expired_date is not null and v_expired_date < v_business_date then raise exception 'EXPIRED_BATCH'; end if;
    v_cost_price := (v_item->>'cost_price')::numeric;
    if v_cost_price < 0 then raise exception 'INVALID_BATCH'; end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_batches) value
    group by btrim(value->>'batch_number'), (value->>'expired_date')::date
    having count(*) > 1
  ) then raise exception 'DUPLICATE_BATCH'; end if;

  if exists (
    select 1 from public.product_batches pb
    join jsonb_array_elements(p_batches) value
      on pb.batch_number = btrim(value->>'batch_number')
      and pb.expired_date is not distinct from (value->>'expired_date')::date
    where pb.product_id = p_product_id
  ) then raise exception 'DUPLICATE_BATCH'; end if;

  for v_item in select value from jsonb_array_elements(p_batches) loop
    insert into public.product_batches(product_id,batch_number,expired_date,quantity,cost_price,received_date)
    values (
      p_product_id,
      btrim(v_item->>'batch_number'),
      (v_item->>'expired_date')::date,
      (v_item->>'quantity')::integer,
      (v_item->>'cost_price')::numeric,
      coalesce((v_item->>'received_date')::date, v_business_date)
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('product_id',p_product_id,'batch_count',v_count);
end;
$$;

create or replace function public.receive_product_stock_manual(
  p_request_id uuid,
  p_employee_id uuid,
  p_product_id uuid,
  p_batches jsonb,
  p_reason text default null,
  p_supplier_id uuid default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.manual_stock_receiving_requests%rowtype;
  v_fingerprint jsonb;
  v_receive_result jsonb;
  v_result jsonb;
  v_occurred_at timestamptz := clock_timestamp();
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_reference text := nullif(btrim(coalesce(p_reference,'')),'');
begin
  if p_request_id is null or p_employee_id is null or p_product_id is null then raise exception 'INVALID_MANUAL_RECEIVING'; end if;
  if length(coalesce(v_reason,'')) > 500 or length(coalesce(v_reference,'')) > 200 then raise exception 'INVALID_MANUAL_RECEIVING'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin') then raise exception 'INVALID_EMPLOYEE'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception 'INVALID_SUPPLIER'; end if;

  v_fingerprint := jsonb_build_object(
    'source','manual','employee_id',p_employee_id,'product_id',p_product_id,
    'batches',p_batches,'reason',v_reason,'supplier_id',p_supplier_id,'reference',v_reference
  );
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,240040));
  select * into v_existing from public.manual_stock_receiving_requests where request_id=p_request_id;
  if found then
    if v_existing.payload <> v_fingerprint then raise exception 'MANUAL_RECEIVING_REQUEST_CONFLICT'; end if;
    return v_existing.result || jsonb_build_object('replayed',true);
  end if;

  v_receive_result := public.receive_product_stock(p_employee_id,p_product_id,p_batches);

  select v_receive_result || jsonb_build_object(
    'request_id',p_request_id,
    'event_count',jsonb_array_length(p_batches),
    'replayed',false
  ) into v_result;
  insert into public.manual_stock_receiving_requests(request_id,source,product_id,actor_id,payload,result,created_at)
  values(p_request_id,'manual',p_product_id,p_employee_id,v_fingerprint,v_result,v_occurred_at);

  insert into public.manual_stock_receiving_events(
    request_id,source,product_id,batch_id,quantity_base,actor_id,occurred_at,reason,supplier_id,reference
  )
  select p_request_id,'manual',p_product_id,pb.id,(item.value->>'quantity')::integer,
    p_employee_id,v_occurred_at,v_reason,p_supplier_id,v_reference
  from jsonb_array_elements(p_batches) with ordinality item(value,n)
  join public.product_batches pb on pb.product_id=p_product_id
    and pb.batch_number=btrim(item.value->>'batch_number')
    and pb.expired_date is not distinct from (item.value->>'expired_date')::date;

  if (select count(*) from public.manual_stock_receiving_events where request_id=p_request_id) <> jsonb_array_length(p_batches) then
    raise exception 'MANUAL_RECEIVING_EVENT_MISMATCH';
  end if;
  return v_result;
end;
$$;

create or replace function public.write_purchase_invoice_item(p_invoice_id uuid,p_item_id uuid,p_request_id uuid,p_employee_id uuid,p_expected_version integer,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_invoice public.purchase_invoices;
  v_item public.purchase_invoice_items;
  v_product public.products;
  v_unit public.product_units;
  v_request public.purchase_invoice_requests;
  v_fingerprint jsonb;
  v_unit_id uuid;
  v_conversion integer;
  v_unit_name text;
  v_cost numeric;
  v_tax numeric;
  v_margin numeric;
  v_selling numeric;
  v_quantity integer;
  v_expiry date;
  v_batch text;
  v_mode text;
  v_calculated double precision;
begin
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin') then raise exception 'FORBIDDEN'; end if;
  if p_invoice_id is null or p_item_id is null or p_request_id is null or p_action not in ('create','update','delete') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_INVOICE_ITEM'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,240024));
  select * into v_invoice from public.purchase_invoices where id=p_invoice_id for update;
  if not found then raise exception 'PURCHASE_INVOICE_NOT_FOUND'; end if;
  if v_invoice.status<>'draft' then raise exception 'INVOICE_NOT_DRAFT'; end if;
  v_fingerprint:=jsonb_build_object('kind','item','item_id',p_item_id,'action',p_action,'version',p_expected_version,'data',p_payload);
  select * into v_request from public.purchase_invoice_requests where request_id=p_request_id;
  if found then
    if v_request.invoice_id<>p_invoice_id or v_request.employee_id<>p_employee_id or v_request.payload<>v_fingerprint then raise exception 'INVOICE_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('id',p_item_id,'replayed',true);
  end if;
  select * into v_item from public.purchase_invoice_items where id=p_item_id for update;
  if p_action='create' then
    if found then raise exception 'INVOICE_ITEM_VERSION_CONFLICT'; end if;
    if p_expected_version is not null then raise exception 'INVALID_INVOICE_ITEM'; end if;
  else
    if not found or v_item.invoice_id<>p_invoice_id or v_item.deleted_at is not null then raise exception 'INVOICE_ITEM_NOT_FOUND'; end if;
    if p_expected_version is null or v_item.version<>p_expected_version then raise exception 'INVOICE_ITEM_VERSION_CONFLICT'; end if;
  end if;
  if p_action='delete' then
    update public.purchase_invoice_items set deleted_at=now(),version=version+1,updated_at=now(),updated_by=p_employee_id where id=p_item_id;
  else
    begin
      select * into v_product from public.products where id=(p_payload->>'product_id')::uuid;
      if not found or not v_product.is_active then raise exception 'INVALID_INVOICE_ITEM'; end if;
      if p_action='update' and v_item.product_id<>v_product.id then raise exception 'INVALID_INVOICE_ITEM'; end if;
      v_unit_id:=(p_payload->>'product_unit_id')::uuid;
      if v_unit_id is null then
        v_conversion:=1; v_unit_name:=v_product.base_unit;
      else
        select * into v_unit from public.product_units where id=v_unit_id and product_id=v_product.id;
        if not found then raise exception 'INVALID_INVOICE_ITEM'; end if;
        v_conversion:=v_unit.conversion_to_base; v_unit_name:=v_unit.unit_name;
      end if;
      if coalesce(p_payload->>'cost_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
        or coalesce(p_payload->>'selling_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
        or coalesce(p_payload->>'tax_rate','') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
        or coalesce(p_payload->>'quantity','') !~ '^[1-9][0-9]{0,9}$'
        or (p_payload->>'expired_date' is not null and (p_payload->>'expired_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        then raise exception 'INVALID_INVOICE_ITEM'; end if;
      v_cost:=(p_payload->>'cost_price')::numeric; v_tax:=(p_payload->>'tax_rate')::numeric;
      v_selling:=(p_payload->>'selling_price')::numeric; v_quantity:=(p_payload->>'quantity')::integer;
      v_margin:=(p_payload->>'margin_percent')::numeric; v_mode:=p_payload->>'pricing_mode';
      v_expiry:=(p_payload->>'expired_date')::date; v_batch:=btrim(coalesce(p_payload->>'batch_number',''));
      if v_tax>100 or v_quantity::bigint*v_conversion>2147483647 or length(v_batch) not between 1 and 100
        or (v_expiry is not null and v_expiry<(clock_timestamp() at time zone 'Asia/Jakarta')::date)
        or v_mode not in ('margin','selling_price') or v_mode is null then raise exception 'INVALID_INVOICE_ITEM'; end if;
      if v_mode='margin' then
        v_calculated:=v_cost::double precision*(1+v_margin::double precision/100)*(1+v_tax::double precision/100);
        if v_margin is null or v_margin<0 or v_margin>1e18 or v_selling<>floor(v_calculated)+(case when v_calculated-floor(v_calculated)>=0.5 then 1 else 0 end) then raise exception 'INVALID_INVOICE_ITEM'; end if;
      else
        v_margin:=case when v_cost=0 then null else (v_selling/(1+v_tax/100)/v_cost-1)*100 end;
      end if;
    exception when others then raise exception 'INVALID_INVOICE_ITEM'; end;
    insert into public.purchase_invoice_items(id,invoice_id,product_id,product_unit_id,product_name_snapshot,sku_snapshot,base_unit_snapshot,unit_name_snapshot,conversion_to_base,cost_price,tax_rate,margin_percent,selling_price,pricing_mode,quantity,batch_number,expired_date,created_by,updated_by)
    values(p_item_id,p_invoice_id,v_product.id,v_unit_id,v_product.name,v_product.sku,v_product.base_unit,v_unit_name,v_conversion,v_cost,v_tax,v_margin,v_selling,v_mode,v_quantity,v_batch,v_expiry,p_employee_id,p_employee_id)
    on conflict(id) do update set product_unit_id=excluded.product_unit_id,unit_name_snapshot=excluded.unit_name_snapshot,conversion_to_base=excluded.conversion_to_base,
      cost_price=excluded.cost_price,tax_rate=excluded.tax_rate,margin_percent=excluded.margin_percent,selling_price=excluded.selling_price,pricing_mode=excluded.pricing_mode,
      quantity=excluded.quantity,batch_number=excluded.batch_number,expired_date=excluded.expired_date,version=purchase_invoice_items.version+1,updated_at=now(),updated_by=p_employee_id;
  end if;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,p_invoice_id,v_fingerprint,p_employee_id);
  return jsonb_build_object('id',p_item_id,'replayed',false);
end;
$$;

create or replace function public.purchase_receiving_plan(p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  h public.purchase_invoices; i public.purchase_invoice_items; p public.products; u public.product_units;
  lines jsonb:='[]'; prices jsonb; total numeric; supplier text; plan jsonb; base_cost numeric; calculated double precision;
begin
  select * into h from public.purchase_invoices where id=p_invoice_id;
  if not found then raise exception 'PURCHASE_INVOICE_NOT_FOUND'; end if;
  if h.status<>'draft' then raise exception 'INVOICE_ALREADY_COMPLETED'; end if;
  select name into supplier from public.suppliers where id=h.supplier_id;
  for i in select * from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null order by product_id,updated_at,id loop
    select * into p from public.products where id=i.product_id;
    if not found or not p.is_active then raise exception 'PRODUCT_INACTIVE'; end if;
    if i.quantity<=0 or i.quantity::bigint*i.conversion_to_base>2147483647 or i.conversion_to_base<=0
      or i.cost_price<0 or i.selling_price<0 or i.cost_price::text='NaN' or i.selling_price::text='NaN' or i.tax_rate not between 0 and 100 or length(btrim(i.batch_number)) not between 1 and 100
      or (i.expired_date is not null and i.expired_date<(clock_timestamp() at time zone 'Asia/Jakarta')::date) then raise exception 'INVALID_RECEIVING_ITEM'; end if;
    if i.pricing_mode='margin' then
      calculated:=i.cost_price::double precision*(1+i.margin_percent::double precision/100)*(1+i.tax_rate::double precision/100);
      if i.margin_percent is null or i.margin_percent<0 or i.selling_price<>floor(calculated)+(case when calculated-floor(calculated)>=0.5 then 1 else 0 end) then raise exception 'INVALID_RECEIVING_ITEM'; end if;
    end if;
    if p.base_unit<>i.base_unit_snapshot then raise exception 'INVOICE_UNIT_CHANGED'; end if;
    if i.product_unit_id is null then
      if i.conversion_to_base<>1 or i.unit_name_snapshot<>p.base_unit then raise exception 'INVOICE_UNIT_CHANGED'; end if;
      select * into u from public.product_units where product_id=p.id and is_base_unit;
      if not found then select * into u from public.product_units where product_id=p.id and unit_name=p.base_unit; end if;
      if found and (u.conversion_to_base<>1 or u.unit_name<>p.base_unit) then raise exception 'INVOICE_UNIT_CHANGED'; end if;
    else
      select * into u from public.product_units where id=i.product_unit_id and product_id=p.id;
      if not found or u.conversion_to_base<>i.conversion_to_base or u.unit_name<>i.unit_name_snapshot then raise exception 'INVOICE_UNIT_CHANGED'; end if;
    end if;
    base_cost:=round(i.cost_price/i.conversion_to_base,2);
    if i.cost_price>0 and base_cost=0 then raise exception 'BASE_COST_PRECISION'; end if;
    lines:=lines||jsonb_build_array(jsonb_build_object('item',to_jsonb(i),'target_unit_id',u.id,'old_selling_price',u.selling_price,
      'old_cost_price',p.cost_price,'old_tax_rate',p.tax_rate,'product_updated_at',p.updated_at,'unit_updated_at',u.updated_at,
      'base_cost',base_cost,'quantity_base',i.quantity::bigint*i.conversion_to_base));
  end loop;
  if jsonb_array_length(lines)=0 then raise exception 'INVOICE_EMPTY'; end if;
  select sum(subtotal) into total from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null;
  select jsonb_agg(value order by value->'item'->>'product_id',value->'item'->>'unit_name_snapshot') into prices from (
    select distinct on(value->'item'->>'product_id',coalesce(value->>'target_unit_id','base')) value
    from jsonb_array_elements(lines) with ordinality l(value,n)
    order by value->'item'->>'product_id',coalesce(value->>'target_unit_id','base'),n desc
  ) chosen;
  plan:=jsonb_build_object('invoice_id',h.id,'invoice_number',h.invoice_number,'supplier',supplier,'supplier_id',h.supplier_id,
    'version',h.version,'invoice_date',h.invoice_date,'invoice_total',h.total_amount::text,'item_count',jsonb_array_length(lines),
    'purchase_total',total::text,'difference',(total-h.total_amount)::text,'items',lines,'price_changes',prices);
  return plan||jsonb_build_object('token',md5(plan::text));
end;
$$;

create or replace function public.finalize_purchase_receiving(p_invoice_id uuid,p_employee_id uuid,p_request_id uuid,p_expected_version integer,p_token text,p_acknowledge_difference boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  h public.purchase_invoices; r public.purchase_invoice_requests; g record; b public.product_batches; p public.products; u public.product_units;
  plan jsonb; line jsonb; i public.purchase_invoice_items; fingerprint jsonb; history jsonb:='[]'; batch_id uuid;
  target_unit uuid; created_unit boolean; before_price numeric; base_cost numeric; new_batch_cost numeric;
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
    update public.products set cost_price=base_cost,tax_rate=i.tax_rate,is_taxable=i.tax_rate>0 where id=i.product_id;
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

commit;
