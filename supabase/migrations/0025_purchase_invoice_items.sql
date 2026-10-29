create table public.purchase_invoice_items (
  id uuid primary key,
  invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  base_unit_snapshot text not null,
  unit_name_snapshot text not null,
  conversion_to_base integer not null check (conversion_to_base > 0),
  cost_price numeric(14,2) not null check (cost_price >= 0),
  tax_rate numeric(5,2) not null check (tax_rate between 0 and 100),
  margin_percent numeric check (margin_percent >= -100 and margin_percent <= 1e18),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  pricing_mode text not null check (pricing_mode in ('margin','selling_price')),
  quantity integer not null check (quantity > 0),
  batch_number text not null check (length(btrim(batch_number)) between 1 and 100),
  expired_date date not null,
  subtotal numeric(14,2) generated always as (round(cost_price * quantity * (1 + tax_rate / 100),2)) stored,
  version integer not null default 1,
  deleted_at timestamptz,
  created_by uuid not null references public.employees(id),
  updated_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_unit_id,product_id) references public.product_units(id,product_id) on delete restrict,
  check (quantity::bigint * conversion_to_base <= 2147483647)
);
create index purchase_invoice_items_invoice_idx on public.purchase_invoice_items(invoice_id,created_at) where deleted_at is null;
alter table public.purchase_invoice_items enable row level security;
revoke all on public.purchase_invoice_items from public,anon,authenticated,service_role;
grant select on public.purchase_invoice_items to service_role;

-- Same invoice lock and request ledger as the header. No stock/pricing mutation.
create function public.write_purchase_invoice_item(p_invoice_id uuid,p_item_id uuid,p_request_id uuid,p_employee_id uuid,p_expected_version integer,p_action text,p_payload jsonb)
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
        -- An unpriced master can use its base unit as an invoice-only snapshot.
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
        or coalesce(p_payload->>'expired_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then raise exception 'INVALID_INVOICE_ITEM'; end if;
      v_cost:=(p_payload->>'cost_price')::numeric; v_tax:=(p_payload->>'tax_rate')::numeric;
      v_selling:=(p_payload->>'selling_price')::numeric; v_quantity:=(p_payload->>'quantity')::integer;
      v_margin:=(p_payload->>'margin_percent')::numeric; v_mode:=p_payload->>'pricing_mode';
      v_expiry:=(p_payload->>'expired_date')::date; v_batch:=btrim(coalesce(p_payload->>'batch_number',''));
      if v_tax>100 or v_quantity::bigint*v_conversion>2147483647 or length(v_batch) not between 1 and 100
        or v_expiry<(clock_timestamp() at time zone 'Asia/Jakarta')::date or v_mode not in ('margin','selling_price')
        or v_mode is null then raise exception 'INVALID_INVOICE_ITEM'; end if;
      if v_mode='margin' then
        -- Match existing JavaScript sellingPriceFromCost, including its floating-point rounding.
        v_calculated:=v_cost::double precision*(1+v_margin::double precision/100)*(1+v_tax::double precision/100);
        if v_margin is null or v_margin<0 or v_margin>1e18 or v_selling<>floor(v_calculated)+(case when v_calculated-floor(v_calculated)>=0.5 then 1 else 0 end) then raise exception 'INVALID_INVOICE_ITEM'; end if;
      else
        -- Margin is derived, not accepted as a second conflicting source of truth.
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
end; $$;
revoke all on function public.write_purchase_invoice_item(uuid,uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_purchase_invoice_item(uuid,uuid,uuid,uuid,integer,text,jsonb) to service_role;
