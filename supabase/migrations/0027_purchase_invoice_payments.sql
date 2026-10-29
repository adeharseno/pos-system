alter table public.purchase_invoice_payments add column payment_date date;
update public.purchase_invoice_payments set payment_date=(created_at at time zone 'Asia/Jakarta')::date where payment_date is null;
alter table public.purchase_invoice_payments alter column payment_date set not null;
alter table public.purchase_invoice_payments alter column payment_date set default ((clock_timestamp() at time zone 'Asia/Jakarta')::date);
create index purchase_invoice_payments_invoice_date_idx on public.purchase_invoice_payments(invoice_id,payment_date,created_at,id);
create index purchase_invoices_invoice_number_search_idx on public.purchase_invoices(lower(invoice_number));

create function public.record_purchase_invoice_payment(p_invoice_id uuid,p_request_id uuid,p_employee_id uuid,p_amount numeric,p_payment_date date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  h public.purchase_invoices;
  r public.purchase_invoice_requests;
  fingerprint jsonb;
  paid numeric;
  payment_id uuid;
begin
  perform 1 from public.employees where id=p_employee_id and is_active and position='owner_admin' for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  if p_invoice_id is null or p_request_id is null or p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_payment_date is null then raise exception 'INVALID_INVOICE_PAYMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,240024));
  select * into h from public.purchase_invoices where id=p_invoice_id for update;
  if not found then raise exception 'PURCHASE_INVOICE_NOT_FOUND'; end if;
  fingerprint:=jsonb_build_object('kind','payment','amount',p_amount::text,'payment_date',p_payment_date::text);
  select * into r from public.purchase_invoice_requests where request_id=p_request_id;
  if found then
    if r.invoice_id<>h.id or r.employee_id<>p_employee_id or r.payload<>fingerprint then raise exception 'INVOICE_REQUEST_CONFLICT'; end if;
    select id into payment_id from public.purchase_invoice_payments where invoice_id=h.id and payment_key='payment:'||p_request_id::text;
    return jsonb_build_object('id',payment_id,'invoice_id',h.id,'replayed',true);
  end if;
  select coalesce(sum(amount),0) into paid from public.purchase_invoice_payments where invoice_id=h.id;
  if paid+p_amount>h.total_amount then raise exception 'INVOICE_PAYMENT_EXCEEDS_BALANCE'; end if;
  insert into public.purchase_invoice_payments(invoice_id,payment_key,amount,payment_date,recorded_by)
  values(h.id,'payment:'||p_request_id::text,p_amount,p_payment_date,p_employee_id) returning id into payment_id;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,h.id,fingerprint,p_employee_id);
  return jsonb_build_object('id',payment_id,'invoice_id',h.id,'replayed',false);
end; $$;
revoke all on function public.record_purchase_invoice_payment(uuid,uuid,uuid,numeric,date) from public,anon,authenticated;
grant execute on function public.record_purchase_invoice_payment(uuid,uuid,uuid,numeric,date) to service_role;
