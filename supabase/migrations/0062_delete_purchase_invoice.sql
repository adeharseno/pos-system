-- Migration 0062: Delete Purchase Invoice RPC
-- Safely deletes draft purchase invoices that have NO payments, NO stock receiving receipts, and NO batch dependencies.
-- Completed invoices and invoices with payments or receiving dependencies are strictly blocked.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create or replace function public.delete_purchase_invoice(
  p_invoice_id uuid,
  p_employee_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.purchase_invoices%rowtype;
  v_payment_count integer;
  v_receipt_count integer;
  v_batch_count integer;
begin
  -- 1. Authorization: employee must be an active owner_admin
  perform 1 from public.employees
  where id = p_employee_id and is_active and position = 'owner_admin'::public.employee_position
  for share;
  if not found then
    raise exception 'FORBIDDEN';
  end if;

  if p_invoice_id is null then
    raise exception 'INVALID_PURCHASE_INVOICE';
  end if;

  -- 2. Advisory lock matching invoice transactions (240024 namespace)
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text, 240024));

  -- 3. Row lock on purchase_invoices
  select * into v_invoice
  from public.purchase_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'PURCHASE_INVOICE_NOT_FOUND';
  end if;

  -- 4. Check payment dependencies: strictly blocked if any payment exists
  select count(*) into v_payment_count
  from public.purchase_invoice_payments
  where invoice_id = p_invoice_id;

  if v_payment_count > 0 then
    raise exception 'INVOICE_HAS_PAYMENTS';
  end if;

  -- 5. Check receiving dependencies: strictly blocked if status is completed or receipts exist
  if v_invoice.status = 'completed' then
    raise exception 'INVOICE_ALREADY_RECEIVED';
  end if;

  select count(*) into v_receipt_count
  from public.purchase_invoice_receipts
  where invoice_id = p_invoice_id;

  if v_receipt_count > 0 then
    raise exception 'INVOICE_ALREADY_RECEIVED';
  end if;

  -- 6. Check product batches linked to invoice items
  select count(*) into v_batch_count
  from public.product_batches b
  join public.purchase_invoice_items i on i.id = b.purchase_invoice_item_id
  where i.invoice_id = p_invoice_id;

  if v_batch_count > 0 then
    raise exception 'INVOICE_BATCH_DEPENDENCY';
  end if;

  -- 7. Safe atomic deletion of draft items, requests, and invoice record
  delete from public.purchase_invoice_items
  where invoice_id = p_invoice_id;

  delete from public.purchase_invoice_requests
  where invoice_id = p_invoice_id;

  delete from public.purchase_invoices
  where id = p_invoice_id;

  return jsonb_build_object(
    'deleted', true,
    'id', p_invoice_id,
    'document_path', v_invoice.document_path
  );
end;
$$;

revoke all on function public.delete_purchase_invoice(uuid,uuid) from public, anon, authenticated;
grant execute on function public.delete_purchase_invoice(uuid,uuid) to service_role;

commit;

