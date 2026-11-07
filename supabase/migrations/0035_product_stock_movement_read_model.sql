create index if not exists idx_txn_item_batches_product_created
  on public.transaction_item_batches(product_id, created_at desc, id desc);
create index if not exists idx_purchase_invoice_receipts_product_received
  on public.purchase_invoice_receipts(product_id, received_at desc, item_id desc);

create or replace function public.product_stock_movement_read_model(
  p_product_id uuid,
  p_page integer default 1,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offset integer;
  v_result jsonb;
begin
  if p_product_id is null then raise exception 'product id is required' using errcode = '22023'; end if;
  if p_page < 1 or p_page > 10000 then raise exception 'invalid page' using errcode = '22023'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  v_offset := (p_page - 1) * p_limit;

  with events as (
    select
      'sale:' || tib.id::text as event_id,
      tib.created_at as occurred_at,
      'out'::text as movement_type,
      tib.quantity_in_base as quantity,
      p.base_unit as unit,
      e.full_name as employee_name,
      null::text as supplier_name,
      t.invoice_number as reference_number,
      '/transactions/' || t.id::text as reference_url
    from public.transaction_item_batches tib
    join public.transaction_items ti on ti.id = tib.transaction_item_id and ti.product_id = tib.product_id
    join public.transactions t on t.id = ti.transaction_id and t.status = 'completed'
    join public.products p on p.id = tib.product_id
    left join public.employees e on e.id = t.cashier_id
    where tib.product_id = p_product_id

    union all

    select
      'receipt:' || pir.item_id::text as event_id,
      pir.received_at as occurred_at,
      'in'::text as movement_type,
      pir.quantity_base as quantity,
      p.base_unit as unit,
      e.full_name as employee_name,
      s.name as supplier_name,
      pi.invoice_number as reference_number,
      '/purchase-invoices/' || pi.id::text as reference_url
    from public.purchase_invoice_receipts pir
    join public.purchase_invoices pi on pi.id = pir.invoice_id and pi.status = 'completed'
    join public.products p on p.id = pir.product_id
    left join public.employees e on e.id = pi.completed_by
    left join public.suppliers s on s.id = pi.supplier_id
    where pir.product_id = p_product_id
  ), paged as (
    select * from events
    order by occurred_at desc, event_id desc
    limit p_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'eventId', event_id,
      'occurredAt', occurred_at,
      'type', movement_type,
      'quantity', quantity,
      'unit', unit,
      'employeeName', employee_name,
      'supplierName', supplier_name,
      'referenceNumber', reference_number,
      'referenceUrl', reference_url
    ) order by occurred_at desc, event_id desc) from paged), '[]'::jsonb),
    'total', (select count(*) from events)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.product_stock_movement_read_model(uuid,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.product_stock_movement_read_model(uuid,integer,integer) to service_role;
comment on function public.product_stock_movement_read_model(uuid,integer,integer) is
  'Read-only product movement history from completed sales allocations and finalized purchase receipts.';
