create table public.purchase_invoices (
  id uuid primary key,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  invoice_number text not null check (length(btrim(invoice_number)) between 1 and 100),
  invoice_date date not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  status text not null default 'draft' check (status = 'draft'),
  document_path text unique,
  document_name text,
  document_type text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.employees(id),
  updated_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((document_path is null and document_name is null and document_type is null) or
    (document_path is not null and document_name is not null and document_type is not null and document_type in ('application/pdf','image/jpeg','image/png','image/webp')))
);
create unique index purchase_invoices_supplier_number_key on public.purchase_invoices(supplier_id,lower(btrim(invoice_number)));
create index purchase_invoices_created_at_idx on public.purchase_invoices(created_at desc);

-- One mutable initial payment while Draft; future payments use their own immutable keys.
create table public.purchase_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  payment_key text not null,
  amount numeric(14,2) not null check (amount > 0),
  recorded_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_id,payment_key)
);
create table public.purchase_invoice_requests (
  request_id uuid primary key,
  invoice_id uuid not null references public.purchase_invoices(id) on delete restrict,
  payload jsonb not null,
  employee_id uuid not null references public.employees(id),
  created_at timestamptz not null default now()
);
alter table public.purchase_invoices enable row level security;
alter table public.purchase_invoice_payments enable row level security;
alter table public.purchase_invoice_requests enable row level security;
revoke all on public.purchase_invoices,public.purchase_invoice_payments,public.purchase_invoice_requests from public,anon,authenticated,service_role;
grant select on public.purchase_invoices,public.purchase_invoice_payments to service_role;

create function public.save_purchase_invoice_draft(p_id uuid,p_request_id uuid,p_employee_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_existing public.purchase_invoices;
  v_request public.purchase_invoice_requests;
  v_supplier uuid;
  v_number text;
  v_date date;
  v_total numeric;
  v_paid numeric;
  v_other_paid numeric;
  v_path text;
  v_name text;
  v_type text;
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

  v_number:=btrim(coalesce(p_payload->>'invoice_number',''));
  if length(v_number) not between 1 and 100
    or coalesce(p_payload->>'total_amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    or coalesce(p_payload->>'paid_amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    or coalesce(p_payload->>'invoice_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  begin
    v_supplier:=(p_payload->>'supplier_id')::uuid;
    v_date:=(p_payload->>'invoice_date')::date;
    v_total:=(p_payload->>'total_amount')::numeric;
    v_paid:=(p_payload->>'paid_amount')::numeric;
  exception when others then raise exception 'INVALID_PURCHASE_INVOICE'; end;
  if v_total<=0 or v_paid<0 or v_paid>v_total then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
  if not exists(select 1 from public.suppliers where id=v_supplier and (is_active or id=v_existing.supplier_id)) then raise exception 'INVALID_SUPPLIER'; end if;
  select coalesce(sum(amount),0) into v_other_paid from public.purchase_invoice_payments where invoice_id=p_id and payment_key<>'initial';
  if v_paid+v_other_paid>v_total then raise exception 'INVALID_PURCHASE_INVOICE'; end if;

  -- Omitted document preserves the existing attachment. A new path is immutable and owned by this invoice.
  v_path:=coalesce(p_payload->>'document_path',v_existing.document_path);
  v_name:=coalesce(p_payload->>'document_name',v_existing.document_name);
  v_type:=coalesce(p_payload->>'document_type',v_existing.document_type);
  if v_path is not null then
    if v_path not like p_id::text||'/%' or v_type is null or v_name is null or v_type not in ('application/pdf','image/jpeg','image/png','image/webp') or length(v_name) not between 1 and 200 then raise exception 'INVALID_PURCHASE_INVOICE'; end if;
    if not exists(select 1 from storage.objects where bucket_id='purchase-invoices' and name=v_path) then raise exception 'INVOICE_DOCUMENT_NOT_FOUND'; end if;
  end if;
  insert into public.purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,document_path,document_name,document_type,created_by,updated_by)
  values(p_id,v_supplier,v_number,v_date,v_total,v_path,v_name,v_type,p_employee_id,p_employee_id)
  on conflict(id) do update set supplier_id=excluded.supplier_id,invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,
    total_amount=excluded.total_amount,document_path=excluded.document_path,document_name=excluded.document_name,document_type=excluded.document_type,
    updated_by=p_employee_id,updated_at=now(),version=purchase_invoices.version+1;
  if v_paid=0 then
    delete from public.purchase_invoice_payments where invoice_id=p_id and payment_key='initial';
  else
    insert into public.purchase_invoice_payments(invoice_id,payment_key,amount,recorded_by) values(p_id,'initial',v_paid,p_employee_id)
    on conflict(invoice_id,payment_key) do update set amount=excluded.amount,recorded_by=excluded.recorded_by,updated_at=now();
  end if;
  insert into public.purchase_invoice_requests(request_id,invoice_id,payload,employee_id) values(p_request_id,p_id,p_payload,p_employee_id);
  return jsonb_build_object('id',p_id,'replayed',false);
end; $$;
revoke all on function public.save_purchase_invoice_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_purchase_invoice_draft(uuid,uuid,uuid,integer,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('purchase-invoices','purchase-invoices',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);
-- No browser storage policies: documents are served only through the authorized server endpoint.
