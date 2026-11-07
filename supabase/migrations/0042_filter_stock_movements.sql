create or replace function public.product_stock_movement_read_model(
  p_product_id uuid,
  p_page integer,
  p_limit integer,
  p_movement_type text,
  p_start_date date,
  p_end_date date
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_offset integer; v_result jsonb;
begin
  if p_product_id is null then raise exception 'product id is required' using errcode='22023'; end if;
  if p_page < 1 or p_page > 10000 then raise exception 'invalid page' using errcode='22023'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid limit' using errcode='22023'; end if;
  if p_movement_type is not null and p_movement_type not in (
    'sale','void','invoice','customer_return','supplier_return','stock_opname','manual_receiving'
  ) then raise exception 'invalid movement type' using errcode='22023'; end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode='22023';
  end if;
  v_offset := (p_page - 1) * p_limit;
  with events as (
    select 'sale:'||tib.id::text event_id,tib.created_at occurred_at,'out'::text movement_type,
      tib.quantity_in_base quantity,p.base_unit unit,e.full_name employee_name,null::text supplier_name,
      t.invoice_number reference_number,'/transactions/'||t.id::text reference_url,null::text batch_number,null::text reason
    from public.transaction_item_batches tib
    join public.transaction_items ti on ti.id=tib.transaction_item_id and ti.product_id=tib.product_id
    join public.transactions t on t.id=ti.transaction_id join public.products p on p.id=tib.product_id
    left join public.employees e on e.id=t.cashier_id where tib.product_id=p_product_id
    union all
    select 'void:'||tib.id::text,t.voided_at,'void',tib.quantity_in_base,p.base_unit,e.full_name,null::text,
      t.invoice_number,'/transactions/'||t.id::text,null::text,null::text
    from public.transaction_item_batches tib
    join public.transaction_items ti on ti.id=tib.transaction_item_id and ti.product_id=tib.product_id
    join public.transactions t on t.id=ti.transaction_id and t.status='voided' and t.voided_at is not null
    join public.products p on p.id=tib.product_id left join public.employees e on e.id=t.voided_by
    where tib.product_id=p_product_id
    union all
    select 'customer-return:'||rib.id::text,rib.created_at,'customer_return',rib.quantity_in_base,
      p.base_unit,e.full_name,null::text,t.invoice_number,'/transactions/'||t.id::text,null::text,null::text
    from public.return_item_batches rib join public.return_items ri on ri.id=rib.return_item_id and ri.product_id=rib.product_id
    join public.returns r on r.id=ri.return_id and r.source='customer' join public.transactions t on t.id=r.transaction_id
    join public.products p on p.id=rib.product_id left join public.employees e on e.id=r.processed_by
    where rib.product_id=p_product_id
    union all
    select 'supplier-return:'||rib.id::text,rib.created_at,'supplier_return',rib.quantity_in_base,
      p.base_unit,e.full_name,s.name,'Retur '||r.id::text,null::text,null::text,null::text
    from public.return_item_batches rib join public.return_items ri on ri.id=rib.return_item_id and ri.product_id=rib.product_id
    join public.returns r on r.id=ri.return_id and r.source='supplier' join public.products p on p.id=rib.product_id
    left join public.employees e on e.id=r.processed_by left join public.batch_supplier bs on bs.batch_id=rib.batch_id
    left join public.suppliers s on s.id=bs.supplier_id where rib.product_id=p_product_id
    union all
    select 'stock-opname:'||oi.id::text,os.applied_at,
      case when oi.variance>0 then 'stock_opname_in' else 'stock_opname_out' end,
      abs(oi.variance),p.base_unit,e.full_name,null::text,'Opname '||os.id::text,null::text,null::text,null::text
    from public.stock_opname_items oi
    join public.stock_opname_sessions os on os.id=oi.session_id and os.status='applied' and os.applied_at is not null
    join public.products p on p.id=oi.product_id left join public.employees e on e.id=os.applied_by
    where oi.product_id=p_product_id and oi.variance<>0
    union all
    select 'receipt:'||pir.item_id::text,pir.received_at,'in',pir.quantity_base,p.base_unit,e.full_name,s.name,
      pi.invoice_number,'/purchase-invoices/'||pi.id::text,null::text,null::text
    from public.purchase_invoice_receipts pir join public.purchase_invoices pi on pi.id=pir.invoice_id and pi.status='completed'
    join public.products p on p.id=pir.product_id left join public.employees e on e.id=pi.completed_by
    left join public.suppliers s on s.id=pi.supplier_id where pir.product_id=p_product_id
    union all
    select 'manual-receiving:'||mse.id::text,mse.occurred_at,'manual_receiving',mse.quantity_base,
      p.base_unit,e.full_name,s.name,mse.reference,null::text,pb.batch_number,mse.reason
    from public.manual_stock_receiving_events mse
    join public.products p on p.id=mse.product_id
    join public.product_batches pb on pb.id=mse.batch_id and pb.product_id=mse.product_id
    left join public.employees e on e.id=mse.actor_id
    left join public.suppliers s on s.id=mse.supplier_id
    where mse.product_id=p_product_id and mse.source='manual'
  ), filtered as (
    select * from events
    where (p_movement_type is null or case p_movement_type
      when 'sale' then movement_type='out'
      when 'void' then movement_type='void'
      when 'invoice' then movement_type='in'
      when 'customer_return' then movement_type='customer_return'
      when 'supplier_return' then movement_type='supplier_return'
      when 'stock_opname' then movement_type in ('stock_opname_in','stock_opname_out')
      when 'manual_receiving' then movement_type='manual_receiving'
      else false end)
      and (p_start_date is null or occurred_at >= (p_start_date::timestamp at time zone 'Asia/Jakarta'))
      and (p_end_date is null or occurred_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Jakarta'))
  ), paged as (
    select * from filtered order by occurred_at desc,event_id desc limit p_limit offset v_offset
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
    'eventId',event_id,'occurredAt',occurred_at,'type',movement_type,'quantity',quantity,'unit',unit,
    'employeeName',employee_name,'supplierName',supplier_name,'referenceNumber',reference_number,
    'referenceUrl',reference_url,'batchNumber',batch_number,'reason',reason
  ) order by occurred_at desc,event_id desc) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered)) into v_result;
  return v_result;
end; $$;

revoke all on function public.product_stock_movement_read_model(uuid,integer,integer,text,date,date) from public,anon,authenticated,service_role;
grant execute on function public.product_stock_movement_read_model(uuid,integer,integer,text,date,date) to service_role;
comment on function public.product_stock_movement_read_model(uuid,integer,integer,text,date,date) is
  'Database-side filtered stock movements using inclusive Asia/Jakarta calendar dates.';
