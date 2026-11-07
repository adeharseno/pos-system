begin;

alter table public.purchase_invoices
  add column payment_method text,
  add column due_days integer,
  add column due_date date,
  add constraint purchase_invoice_payment_terms_valid check (
    payment_method is null
    or (payment_method='cash' and due_days is null and due_date is null)
    or (payment_method='terms' and due_days>0 and due_date=invoice_date+due_days)
  );
create index purchase_invoices_due_reminder_idx on public.purchase_invoices(due_date,id) where payment_method='terms';

create function public.save_purchase_invoice_draft_v2(p_id uuid,p_request_id uuid,p_employee_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.purchase_invoices; v_request public.purchase_invoice_requests; v_supplier uuid; v_number text;
  v_date date; v_total numeric; v_other_paid numeric; v_initial numeric; v_method text; v_due_days integer; v_due_date date;
  v_path text; v_name text; v_type text;
begin
  if not exists(select 1 from public.employees where id=p_employee_id and is_active and position='owner_admin') then raise exception 'FORBIDDEN'; end if;
  if p_id is null or p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,240024));
  select * into v_request from public.purchase_invoice_requests where request_id=p_request_id;
  if found then
    if v_request.invoice_id<>p_id or v_request.payload<>p_payload or v_request.employee_id<>p_employee_id then raise exception 'INVOICE_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('id',p_id,'replayed',true);
  end if;
  select * into v_existing from public.purchase_invoices where id=p_id for update;
  if found then
    if p_expected_version is null or v_existing.version<>p_expected_version then raise exception 'INVOICE_VERSION_CONFLICT'; end if;
    if v_existing.status<>'draft' then raise exception 'INVOICE_NOT_DRAFT'; end if;
  elsif p_expected_version is not null then raise exception 'PURCHASE_INVOICE_NOT_FOUND'; end if;
  v_number:=btrim(coalesce(p_payload->>'invoice_number','')); v_method:=p_payload->>'payment_method';
  if length(v_number) not between 1 and 100 or coalesce(p_payload->>'total_amount','')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$'
    or coalesce(p_payload->>'invoice_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_method not in('cash','terms')
    then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  begin v_supplier:=(p_payload->>'supplier_id')::uuid; v_date:=(p_payload->>'invoice_date')::date; v_total:=(p_payload->>'total_amount')::numeric;
    if v_method='terms' then v_due_days:=(p_payload->>'due_days')::integer; end if;
  exception when others then raise exception 'INVALID_PURCHASE_INVOICE'; end;
  if v_total<=0 or (v_method='terms' and (v_due_days is null or v_due_days<=0 or v_due_days>36500)) then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  v_due_date:=case when v_method='terms' then v_date+v_due_days else null end;
  if not exists(select 1 from public.suppliers where id=v_supplier and (is_active or id=v_existing.supplier_id)) then raise exception 'INVALID_SUPPLIER'; end if;
  select coalesce(sum(amount),0) into v_other_paid from public.purchase_invoice_payments where invoice_id=p_id and payment_key<>'initial';
  if v_other_paid>v_total then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  v_initial:=case when v_method='cash' then v_total-v_other_paid else 0 end;
  v_path:=coalesce(p_payload->>'document_path',v_existing.document_path); v_name:=coalesce(p_payload->>'document_name',v_existing.document_name); v_type:=coalesce(p_payload->>'document_type',v_existing.document_type);
  if v_path is not null then
    if v_path not like p_id::text||'/%' or v_type is null or v_name is null or v_type not in('application/pdf','image/jpeg','image/png','image/webp') or length(v_name) not between 1 and 200 then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
    if not exists(select 1 from storage.objects where bucket_id='purchase-invoices' and name=v_path) then raise exception 'INVOICE_DOCUMENT_NOT_FOUND'; end if;
  end if;
  insert into public.purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,payment_method,due_days,due_date,document_path,document_name,document_type,created_by,updated_by)
  values(p_id,v_supplier,v_number,v_date,v_total,v_method,v_due_days,v_due_date,v_path,v_name,v_type,p_employee_id,p_employee_id)
  on conflict(id) do update set supplier_id=excluded.supplier_id,invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,total_amount=excluded.total_amount,
    payment_method=excluded.payment_method,due_days=excluded.due_days,due_date=excluded.due_date,document_path=excluded.document_path,document_name=excluded.document_name,
    document_type=excluded.document_type,updated_by=p_employee_id,updated_at=now(),version=purchase_invoices.version+1;
  if v_initial=0 then delete from public.purchase_invoice_payments where invoice_id=p_id and payment_key='initial';
  else insert into public.purchase_invoice_payments(invoice_id,payment_key,amount,payment_date,recorded_by)
    values(p_id,'initial',v_initial,v_date,p_employee_id)
    on conflict(invoice_id,payment_key) do update set amount=excluded.amount,payment_date=excluded.payment_date,recorded_by=excluded.recorded_by,updated_at=now(); end if;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,p_id,p_payload,p_employee_id);
  return jsonb_build_object('id',p_id,'replayed',false);
end; $$;
revoke all on function public.save_purchase_invoice_draft_v2(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_purchase_invoice_draft_v2(uuid,uuid,uuid,integer,jsonb) to service_role;

create function public.purchase_invoice_due_reminders(p_today date)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with paid as(select invoice_id,sum(amount) amount from public.purchase_invoice_payments group by invoice_id), due as(
    select i.id,i.invoice_number,i.due_date,s.name supplier,i.total_amount-coalesce(p.amount,0) outstanding,(i.due_date-p_today) days_remaining
    from public.purchase_invoices i join public.suppliers s on s.id=i.supplier_id left join paid p on p.invoice_id=i.id
    where i.payment_method='terms' and i.due_date<=p_today+7 and i.total_amount>coalesce(p.amount,0)
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'invoiceNumber',invoice_number,'supplier',supplier,'dueDate',due_date,
    'outstanding',outstanding,'daysRemaining',days_remaining) order by due_date,id),'[]'::jsonb) from due;
$$;
revoke all on function public.purchase_invoice_due_reminders(date) from public,anon,authenticated,service_role;
grant execute on function public.purchase_invoice_due_reminders(date) to service_role;

commit;
