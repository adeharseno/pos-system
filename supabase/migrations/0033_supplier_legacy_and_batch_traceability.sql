-- Supplier legacy mapping, and traceability from stock batches back to suppliers.

-- A. Supplier legacy code. Names stay non-unique at DB level; duplicate active
-- names are rejected by the application.
alter table public.suppliers add column if not exists legacy_code text;
create unique index if not exists uq_suppliers_legacy_code
  on public.suppliers (legacy_code)
  where legacy_code is not null;

-- C. Batches created by invoice receiving point at their source invoice item.
-- Nullable: opening stock and stock-opname adjustment batches have no invoice.
alter table public.product_batches add column if not exists purchase_invoice_item_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_batches_purchase_invoice_item_id_fkey'
      and conrelid = 'public.product_batches'::regclass
  ) then
    alter table public.product_batches
      add constraint product_batches_purchase_invoice_item_id_fkey
      foreign key (purchase_invoice_item_id)
      references public.purchase_invoice_items(id)
      on delete restrict;
  end if;
end $$;
create index if not exists idx_batches_purchase_invoice_item
  on public.product_batches (purchase_invoice_item_id);

create or replace view public.batch_supplier as
select
  b.id as batch_id,
  b.product_id,
  pi.supplier_id,
  pi.id as invoice_id,
  pi.invoice_number,
  b.created_at as received_at
from public.product_batches b
left join public.purchase_invoice_items pii on pii.id = b.purchase_invoice_item_id
left join public.purchase_invoices pi on pi.id = pii.invoice_id;

revoke all on public.batch_supplier from public, anon, authenticated;
grant select on public.batch_supplier to service_role;

-- Set the source item only when receiving creates a new batch. Existing batches
-- may already contain opening stock or stock from another supplier, so their
-- original attribution is preserved.
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

  for g in select product_id,batch_number,expired_date,sum(quantity::bigint*conversion_to_base) as qty,sum(cost_price*quantity) as cost,
      (array_agg(id order by created_at,id))[1] as item_id
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
