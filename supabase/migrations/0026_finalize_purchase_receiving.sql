alter table public.purchase_invoices drop constraint purchase_invoices_status_check;
alter table public.purchase_invoices add constraint purchase_invoices_status_check check (status in ('draft','completed'));
alter table public.purchase_invoices add column completed_at timestamptz, add column completed_by uuid references public.employees(id), add column finalization_snapshot jsonb;
alter table public.purchase_invoices add constraint purchase_invoice_completion_check check (
  (status='draft' and completed_at is null and completed_by is null and finalization_snapshot is null) or
  (status='completed' and completed_at is not null and completed_by is not null and finalization_snapshot is not null));

create table public.purchase_invoice_receipts (
  item_id uuid primary key references public.purchase_invoice_items(id) on delete restrict,
  invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null references public.product_units(id) on delete restrict,
  batch_id uuid not null references public.product_batches(id) on delete restrict,
  quantity_base integer not null check (quantity_base>0),
  cost_price_base numeric(14,2) not null check (cost_price_base>=0),
  previous_cost_price numeric(14,2), new_cost_price numeric(14,2) not null,
  previous_selling_price numeric(14,2), new_selling_price numeric(14,2) not null,
  previous_tax_rate numeric(5,2) not null, new_tax_rate numeric(5,2) not null,
  created_base_unit boolean not null,
  received_at timestamptz not null default clock_timestamp()
);
create index purchase_invoice_receipts_invoice_idx on public.purchase_invoice_receipts(invoice_id);
alter table public.purchase_invoice_receipts enable row level security;
revoke all on public.purchase_invoice_receipts from public,anon,authenticated,service_role;
grant select on public.purchase_invoice_receipts to service_role;

-- Internal read-only plan shared by preview and the locked transaction.
create function public.purchase_receiving_plan(p_invoice_id uuid) returns jsonb
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
      or i.expired_date<(clock_timestamp() at time zone 'Asia/Jakarta')::date then raise exception 'INVALID_RECEIVING_ITEM'; end if;
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
    -- Never turn a positive cost into a fictitious zero through currency rounding.
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
end; $$;
revoke all on function public.purchase_receiving_plan(uuid) from public,anon,authenticated,service_role;

create function public.preview_purchase_receiving(p_invoice_id uuid,p_employee_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin') then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,240024));
  return public.purchase_receiving_plan(p_invoice_id);
end; $$;
revoke all on function public.preview_purchase_receiving(uuid,uuid) from public,anon,authenticated;
grant execute on function public.preview_purchase_receiving(uuid,uuid) to service_role;

create function public.finalize_purchase_receiving(p_invoice_id uuid,p_employee_id uuid,p_request_id uuid,p_expected_version integer,p_token text,p_acknowledge_difference boolean)
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
  -- Shared with existing receive/opname, acquired before any batch mutation.
  perform pg_advisory_xact_lock(73194001);
  if exists(select 1 from public.stock_opname_sessions where status='in_progress') then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;
  -- NO KEY UPDATE is compatible with the legacy receiver's product KEY SHARE lock.
  perform 1 from public.products where id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null) order by id for no key update;
  perform 1 from public.product_units where product_id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null) order by product_id,id for update;
  perform 1 from public.product_batches where product_id in(select product_id from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null) order by product_id,expired_date,created_at,id for update;
  plan:=public.purchase_receiving_plan(h.id);
  if plan->>'token'<>p_token then raise exception 'INVOICE_RECEIVING_CHANGED'; end if;
  if (plan->>'difference')::numeric<>0 and not p_acknowledge_difference then raise exception 'INVOICE_DIFFERENCE_NOT_CONFIRMED'; end if;

  for g in select product_id,batch_number,expired_date,sum(quantity::bigint*conversion_to_base) as qty,sum(cost_price*quantity) as cost
    from public.purchase_invoice_items where invoice_id=h.id and deleted_at is null group by product_id,batch_number,expired_date order by product_id,expired_date,batch_number loop
    if g.qty>2147483647 then raise exception 'INVALID_RECEIVING_ITEM'; end if;
    select * into b from public.product_batches where product_id=g.product_id and batch_number=g.batch_number and expired_date=g.expired_date for update;
    if found then
      if b.quantity::bigint+g.qty>2147483647 then raise exception 'INVALID_RECEIVING_ITEM'; end if;
      new_batch_cost:=round((b.quantity*b.cost_price+g.cost)/(b.quantity+g.qty),2);
      update public.product_batches set quantity=quantity+g.qty,cost_price=new_batch_cost where id=b.id;
      batch_id:=b.id;
    else
      new_batch_cost:=round(g.cost/g.qty,2);
      perform public.receive_product_stock(p_employee_id,g.product_id,jsonb_build_array(jsonb_build_object('batch_number',g.batch_number,'expired_date',g.expired_date,'quantity',g.qty,'cost_price',new_batch_cost)));
      select id into batch_id from public.product_batches where product_id=g.product_id and batch_number=g.batch_number and expired_date=g.expired_date;
    end if;
    history:=history||jsonb_build_array(jsonb_build_object('batch_id',batch_id,'product_id',g.product_id,'batch_number',g.batch_number,'expired_date',g.expired_date,
      'previous_quantity',coalesce(b.quantity,0),'previous_cost',b.cost_price,'received_quantity',g.qty,'received_cost',g.cost,'new_cost',new_batch_cost));
  end loop;

  for line in select value from jsonb_array_elements(plan->'items') loop
    select * into i from public.purchase_invoice_items where id=(line->'item'->>'id')::uuid;
    select * into p from public.products where id=i.product_id;
    target_unit:=(line->>'target_unit_id')::uuid; created_unit:=false;
    if target_unit is null then
      -- Other rows of this invoice may already have created the same base unit.
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
    select id into batch_id from public.product_batches where product_id=i.product_id and batch_number=i.batch_number and expired_date=i.expired_date;
    insert into public.purchase_invoice_receipts(item_id,invoice_id,product_id,product_unit_id,batch_id,quantity_base,cost_price_base,previous_cost_price,new_cost_price,previous_selling_price,new_selling_price,previous_tax_rate,new_tax_rate,created_base_unit)
    values(i.id,h.id,i.product_id,target_unit,batch_id,i.quantity*i.conversion_to_base,base_cost,p.cost_price,base_cost,before_price,i.selling_price,p.tax_rate,i.tax_rate,created_unit);
  end loop;
  update public.purchase_invoices set status='completed',completed_at=clock_timestamp(),completed_by=p_employee_id,
    finalization_snapshot=plan||jsonb_build_object('batch_actions',history),version=version+1,updated_by=p_employee_id,updated_at=clock_timestamp() where id=h.id;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,h.id,fingerprint,p_employee_id);
  return jsonb_build_object('id',h.id,'status','completed','replayed',false);
end; $$;
revoke all on function public.finalize_purchase_receiving(uuid,uuid,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_purchase_receiving(uuid,uuid,uuid,integer,text,boolean) to service_role;
