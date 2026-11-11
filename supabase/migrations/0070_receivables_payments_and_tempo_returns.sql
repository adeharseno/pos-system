-- Migration 0070: Customer Receivable Payments (Append-Only Ledger),
-- Piutang Summary/Listing/Detail RPCs, Tempo Return Opsi A, and Accrual/Cash-Basis Reporting Integration

-- 1. Append-only ledger for TEMPO receivable payments
create table if not exists public.customer_receivable_payments (
  id uuid primary key default gen_random_uuid(),
  receivable_id uuid not null references public.customer_receivables(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  request_id uuid not null unique,
  payment_date date not null,
  payment_method public.payment_method not null check (payment_method::text in ('cash', 'qris', 'bank_transfer')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  notes text,
  recorded_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint chk_customer_receivable_payments_text_lengths check (
    (reference is null or char_length(reference) <= 120)
    and (notes is null or char_length(notes) <= 500)
  )
);

create index if not exists idx_customer_receivable_payments_receivable
  on public.customer_receivable_payments(receivable_id, payment_date desc, created_at desc);

create index if not exists idx_customer_receivable_payments_report
  on public.customer_receivable_payments(payment_date, payment_method);

create index if not exists idx_customer_receivable_payments_customer
  on public.customer_receivable_payments(customer_id);

alter table public.customer_receivable_payments enable row level security;
drop policy if exists "deny_all_client_access" on public.customer_receivable_payments;
create policy "deny_all_client_access"
  on public.customer_receivable_payments for all to authenticated, anon using (false);

revoke all on public.customer_receivable_payments from public, anon, authenticated, service_role;
grant select, insert on public.customer_receivable_payments to service_role;

-- 2. Extend public.returns to track receivable credit vs excess cash/QRIS/transfer refund for TEMPO Opsi A
alter table public.returns
  add column if not exists receivable_credit_amount numeric(14,2) not null default 0 check (receivable_credit_amount >= 0),
  add column if not exists cash_refund_amount numeric(14,2);

alter table public.returns drop constraint if exists chk_returns_cash_refund_non_negative;
alter table public.returns add constraint chk_returns_cash_refund_non_negative
  check (cash_refund_amount is null or cash_refund_amount >= 0);

-- 3. Atomic & idempotent RPC for recording TEMPO receivable installment/settlement payments (owner_admin only)
create or replace function public.record_customer_receivable_payment(
  p_request_id uuid,
  p_employee_id uuid,
  p_receivable_id uuid,
  p_payment_method public.payment_method,
  p_amount numeric,
  p_payment_date date,
  p_reference text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_rec public.customer_receivables%rowtype;
  v_tx public.transactions%rowtype;
  v_existing public.customer_receivable_payments%rowtype;
  v_amount numeric(14,2);
  v_reference text;
  v_notes text;
  v_new_paid numeric(14,2);
  v_new_status text;
  v_payment_id uuid;
  v_before jsonb;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  if p_request_id is null or p_receivable_id is null or p_payment_date is null or p_amount is null then
    raise exception 'INVALID_RECEIVABLE_PAYMENT_INPUT';
  end if;

  if p_payment_method is null or p_payment_method::text not in ('cash', 'qris', 'bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if p_amount <= 0 or round(p_amount, 2) <> p_amount or p_amount > 999999999999.99 then
    raise exception 'INVALID_PAYMENT_AMOUNT';
  end if;
  v_amount := round(p_amount, 2);

  v_reference := nullif(btrim(p_reference), '');
  v_notes := nullif(btrim(p_notes), '');
  if (v_reference is not null and char_length(v_reference) > 120)
     or (v_notes is not null and char_length(v_notes) > 500) then
    raise exception 'INVALID_RECEIVABLE_PAYMENT_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 70001));

  select * into v_existing from public.customer_receivable_payments where request_id = p_request_id;
  if found then
    if v_existing.receivable_id <> p_receivable_id
       or v_existing.payment_method <> p_payment_method
       or v_existing.amount <> v_amount
       or v_existing.payment_date <> p_payment_date
       or coalesce(v_existing.reference, '') <> coalesce(v_reference, '')
       or coalesce(v_existing.notes, '') <> coalesce(v_notes, '') then
      raise exception 'RECEIVABLE_PAYMENT_REQUEST_CONFLICT';
    end if;

    select * into v_rec from public.customer_receivables where id = v_existing.receivable_id;
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'receivable_id', v_existing.receivable_id,
      'transaction_id', v_existing.transaction_id,
      'customer_id', v_existing.customer_id,
      'amount', v_existing.amount,
      'payment_method', v_existing.payment_method,
      'payment_date', v_existing.payment_date,
      'reference', v_existing.reference,
      'notes', v_existing.notes,
      'paid_amount', v_rec.paid_amount,
      'credited_return_amount', v_rec.credited_return_amount,
      'outstanding_amount', v_rec.outstanding_amount,
      'payment_status', v_rec.payment_status,
      'replayed', true
    );
  end if;

  select * into v_rec from public.customer_receivables where id = p_receivable_id for update;
  if not found then
    raise exception 'RECEIVABLE_NOT_FOUND';
  end if;

  select * into v_tx from public.transactions where id = v_rec.transaction_id;
  if not found or v_tx.status <> 'completed' or v_tx.payment_method::text <> 'tempo' then
    raise exception 'INVALID_TRANSACTION_STATE';
  end if;

  if v_rec.outstanding_amount <= 0 or v_rec.payment_status = 'paid' then
    raise exception 'RECEIVABLE_ALREADY_PAID';
  end if;

  if v_amount > v_rec.outstanding_amount then
    raise exception 'RECEIVABLE_OVERPAYMENT';
  end if;

  v_before := jsonb_build_object(
    'paid_amount', v_rec.paid_amount,
    'credited_return_amount', v_rec.credited_return_amount,
    'outstanding_amount', v_rec.outstanding_amount,
    'payment_status', v_rec.payment_status
  );

  v_new_paid := v_rec.paid_amount + v_amount;
  v_new_status := case
    when v_new_paid + v_rec.credited_return_amount >= v_rec.original_amount then 'paid'
    else 'partial'
  end;

  insert into public.customer_receivable_payments (
    receivable_id, transaction_id, customer_id, request_id,
    payment_date, payment_method, amount, reference, notes, recorded_by
  ) values (
    v_rec.id, v_rec.transaction_id, v_rec.customer_id, p_request_id,
    p_payment_date, p_payment_method, v_amount, v_reference, v_notes, p_employee_id
  ) returning id into v_payment_id;

  update public.customer_receivables
  set paid_amount = v_new_paid,
      payment_status = v_new_status
  where id = v_rec.id
  returning * into v_rec;

  insert into public.security_audit_events (actor_employee_id, action, target_id, before_value, after_value)
  values (
    p_employee_id,
    'receivable.payment.record',
    v_rec.id::text,
    v_before,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', v_amount,
      'payment_method', p_payment_method,
      'payment_date', p_payment_date,
      'reference', v_reference,
      'paid_amount', v_rec.paid_amount,
      'credited_return_amount', v_rec.credited_return_amount,
      'outstanding_amount', v_rec.outstanding_amount,
      'payment_status', v_rec.payment_status
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'receivable_id', v_rec.id,
    'transaction_id', v_rec.transaction_id,
    'customer_id', v_rec.customer_id,
    'amount', v_amount,
    'payment_method', p_payment_method,
    'payment_date', p_payment_date,
    'reference', v_reference,
    'notes', v_notes,
    'paid_amount', v_rec.paid_amount,
    'credited_return_amount', v_rec.credited_return_amount,
    'outstanding_amount', v_rec.outstanding_amount,
    'payment_status', v_rec.payment_status,
    'replayed', false
  );
end;
$$;

revoke all on function public.record_customer_receivable_payment(uuid, uuid, uuid, public.payment_method, numeric, date, text, text) from public, anon, authenticated;
grant execute on function public.record_customer_receivable_payment(uuid, uuid, uuid, public.payment_method, numeric, date, text, text) to service_role;

-- 4. Server-side summary, search, filtering, sorting, and pagination RPC for Piutang (owner_admin only)
create or replace function public.list_customer_receivables(
  p_employee_id uuid,
  p_today date default null,
  p_q text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_status text default 'all',
  p_sort text default 'due_date',
  p_dir text default 'asc',
  p_page integer default 1,
  p_limit integer default 20
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_today date;
  v_q text;
  v_status text;
  v_sort text;
  v_dir text;
  v_page integer;
  v_limit integer;
  v_offset integer;
  v_summary jsonb;
  v_total bigint;
  v_rows jsonb;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  v_today := coalesce(p_today, (clock_timestamp() at time zone 'Asia/Jakarta')::date);
  v_status := coalesce(nullif(btrim(p_status), ''), 'all');
  if v_status not in ('all', 'unpaid', 'partial', 'paid', 'overdue', 'active') then
    raise exception 'INVALID_RECEIVABLE_FILTER';
  end if;

  v_sort := coalesce(nullif(btrim(p_sort), ''), 'due_date');
  if v_sort not in (
    'due_date', 'transaction_date', 'invoice_number', 'customer_name',
    'original_amount', 'paid_amount', 'outstanding_amount', 'status'
  ) then
    raise exception 'INVALID_RECEIVABLE_FILTER';
  end if;

  v_dir := case when lower(coalesce(btrim(p_dir), '')) = 'desc' then 'desc' else 'asc' end;
  v_page := greatest(1, coalesce(p_page, 1));
  v_limit := greatest(1, least(100, coalesce(p_limit, 20)));
  v_offset := (v_page - 1) * v_limit;

  v_q := nullif(btrim(p_q), '');
  if v_q is not null then
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  select jsonb_build_object(
    'total_active_outstanding', round(coalesce(sum(cr.outstanding_amount) filter (where cr.outstanding_amount > 0), 0), 2),
    'unpaid_invoice_count', count(*) filter (where cr.outstanding_amount > 0),
    'due_soon_count', count(*) filter (where cr.outstanding_amount > 0 and cr.due_date >= v_today and cr.due_date <= v_today + 3),
    'overdue_outstanding', round(coalesce(sum(cr.outstanding_amount) filter (where cr.outstanding_amount > 0 and cr.due_date < v_today), 0), 2),
    'overdue_count', count(*) filter (where cr.outstanding_amount > 0 and cr.due_date < v_today)
  )
  into v_summary
  from public.customer_receivables cr;

  with base as (
    select
      cr.id,
      cr.transaction_id,
      t.invoice_number,
      t.business_date,
      t.created_at as transaction_created_at,
      c.id as customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      cr.original_amount,
      cr.paid_amount,
      cr.credited_return_amount,
      cr.outstanding_amount,
      cr.due_date,
      cr.payment_status,
      case
        when cr.outstanding_amount = 0 or cr.payment_status = 'paid' then 'paid'
        when cr.due_date < v_today then 'overdue'
        else cr.payment_status
      end as effective_status
    from public.customer_receivables cr
    join public.transactions t on t.id = cr.transaction_id
    join public.customers c on c.id = cr.customer_id
    where (
      v_q is null
      or t.invoice_number ilike '%' || v_q || '%' escape '\'
      or c.name ilike '%' || v_q || '%' escape '\'
      or coalesce(c.phone, '') ilike '%' || v_q || '%' escape '\'
    )
    and (p_due_from is null or cr.due_date >= p_due_from)
    and (p_due_to is null or cr.due_date <= p_due_to)
  ),
  filtered as (
    select * from base b
    where case
      when v_status = 'all' then true
      when v_status = 'active' then b.outstanding_amount > 0
      else b.effective_status = v_status
    end
  ),
  counted as (
    select count(*) as total_count from filtered
  ),
  paged as (
    select f.*
    from filtered f
    order by
      case when v_sort = 'due_date' and v_dir = 'asc' then f.due_date end asc,
      case when v_sort = 'due_date' and v_dir = 'desc' then f.due_date end desc,
      case when v_sort = 'transaction_date' and v_dir = 'asc' then f.transaction_created_at end asc,
      case when v_sort = 'transaction_date' and v_dir = 'desc' then f.transaction_created_at end desc,
      case when v_sort = 'invoice_number' and v_dir = 'asc' then f.invoice_number end asc,
      case when v_sort = 'invoice_number' and v_dir = 'desc' then f.invoice_number end desc,
      case when v_sort = 'customer_name' and v_dir = 'asc' then f.customer_name end asc,
      case when v_sort = 'customer_name' and v_dir = 'desc' then f.customer_name end desc,
      case when v_sort = 'original_amount' and v_dir = 'asc' then f.original_amount end asc,
      case when v_sort = 'original_amount' and v_dir = 'desc' then f.original_amount end desc,
      case when v_sort = 'paid_amount' and v_dir = 'asc' then f.paid_amount end asc,
      case when v_sort = 'paid_amount' and v_dir = 'desc' then f.paid_amount end desc,
      case when v_sort = 'outstanding_amount' and v_dir = 'asc' then f.outstanding_amount end asc,
      case when v_sort = 'outstanding_amount' and v_dir = 'desc' then f.outstanding_amount end desc,
      case when v_sort = 'status' and v_dir = 'asc' then f.effective_status end asc,
      case when v_sort = 'status' and v_dir = 'desc' then f.effective_status end desc,
      f.due_date asc,
      f.transaction_created_at desc,
      f.id asc
    limit v_limit offset v_offset
  )
  select
    (select total_count from counted),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'transaction_id', p.transaction_id,
            'invoice_number', p.invoice_number,
            'business_date', p.business_date,
            'transaction_created_at', p.transaction_created_at,
            'customer_id', p.customer_id,
            'customer_name', p.customer_name,
            'customer_phone', p.customer_phone,
            'original_amount', round(p.original_amount, 2),
            'paid_amount', round(p.paid_amount, 2),
            'credited_return_amount', round(p.credited_return_amount, 2),
            'outstanding_amount', round(p.outstanding_amount, 2),
            'due_date', p.due_date,
            'payment_status', p.payment_status,
            'effective_status', p.effective_status,
            'is_overdue', p.effective_status = 'overdue'
          )
        )
        from paged p
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object(
    'summary', v_summary,
    'page', v_page,
    'limit', v_limit,
    'total', v_total,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.list_customer_receivables(uuid, date, text, date, date, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_customer_receivables(uuid, date, text, date, date, text, text, text, integer, integer) to service_role;

-- 5. Detailed single receivable RPC (owner_admin only)
create or replace function public.get_customer_receivable_detail(
  p_employee_id uuid,
  p_receivable_id uuid,
  p_today date default null
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_today date;
  v_row record;
  v_items jsonb;
  v_payments jsonb;
  v_returns jsonb;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  if p_receivable_id is null then
    raise exception 'RECEIVABLE_NOT_FOUND';
  end if;

  v_today := coalesce(p_today, (clock_timestamp() at time zone 'Asia/Jakarta')::date);

  select
    cr.*,
    t.invoice_number,
    t.business_date,
    t.created_at as transaction_created_at,
    t.subtotal,
    t.tax_amount,
    t.total_amount,
    e.full_name as cashier_name,
    c.name as customer_name,
    c.phone as customer_phone,
    c.address as customer_address,
    c.notes as customer_notes,
    case
      when cr.outstanding_amount = 0 or cr.payment_status = 'paid' then 'paid'
      when cr.due_date < v_today then 'overdue'
      else cr.payment_status
    end as effective_status
  into v_row
  from public.customer_receivables cr
  join public.transactions t on t.id = cr.transaction_id
  join public.customers c on c.id = cr.customer_id
  join public.employees e on e.id = t.cashier_id
  where cr.id = p_receivable_id;

  if not found then
    raise exception 'RECEIVABLE_NOT_FOUND';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ti.id,
        'product_name', ti.product_name_snapshot,
        'unit_name', ti.unit_name_snapshot,
        'quantity_in_unit', ti.quantity_in_unit,
        'unit_price', round(ti.unit_price, 2),
        'subtotal', round(ti.subtotal, 2),
        'tax_amount', round(ti.tax_amount, 2),
        'total_amount', round(ti.total_amount, 2)
      ) order by ti.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.transaction_items ti
  where ti.transaction_id = v_row.transaction_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'payment_date', p.payment_date,
        'payment_method', p.payment_method,
        'amount', round(p.amount, 2),
        'reference', p.reference,
        'notes', p.notes,
        'recorded_by_name', rec_emp.full_name,
        'created_at', p.created_at
      ) order by p.payment_date desc, p.created_at desc, p.id desc
    ),
    '[]'::jsonb
  )
  into v_payments
  from public.customer_receivable_payments p
  join public.employees rec_emp on rec_emp.id = p.recorded_by
  where p.receivable_id = v_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'return_number', r.return_number,
        'status', r.status,
        'refund_method', r.refund_method,
        'refund_total', round(r.refund_total, 2),
        'receivable_credit_amount', round(r.receivable_credit_amount, 2),
        'cash_refund_amount', round(coalesce(r.cash_refund_amount, 0), 2),
        'reason', r.reason,
        'created_at', r.created_at
      ) order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_returns
  from public.returns r
  where r.transaction_id = v_row.transaction_id
    and r.source = 'customer';

  return jsonb_build_object(
    'id', v_row.id,
    'transaction_id', v_row.transaction_id,
    'invoice_number', v_row.invoice_number,
    'business_date', v_row.business_date,
    'transaction_created_at', v_row.transaction_created_at,
    'cashier_name', v_row.cashier_name,
    'subtotal', round(v_row.subtotal, 2),
    'tax_amount', round(v_row.tax_amount, 2),
    'total_amount', round(v_row.total_amount, 2),
    'customer', jsonb_build_object(
      'id', v_row.customer_id,
      'name', v_row.customer_name,
      'phone', v_row.customer_phone,
      'address', v_row.customer_address,
      'notes', v_row.customer_notes
    ),
    'original_amount', round(v_row.original_amount, 2),
    'paid_amount', round(v_row.paid_amount, 2),
    'credited_return_amount', round(v_row.credited_return_amount, 2),
    'outstanding_amount', round(v_row.outstanding_amount, 2),
    'due_date', v_row.due_date,
    'payment_status', v_row.payment_status,
    'effective_status', v_row.effective_status,
    'is_overdue', v_row.effective_status = 'overdue',
    'items', v_items,
    'payments', v_payments,
    'returns', v_returns
  );
end;
$$;

revoke all on function public.get_customer_receivable_detail(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_customer_receivable_detail(uuid, uuid, date) to service_role;

-- 6. Receivable due-soon & overdue reminder query for owner notifications
create or replace function public.customer_receivable_due_reminders(
  p_today date default null
) returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  with ref as (
    select coalesce(p_today, (clock_timestamp() at time zone 'Asia/Jakarta')::date) as today
  ),
  due as (
    select
      cr.id,
      t.invoice_number,
      c.name as customer_name,
      cr.due_date,
      round(cr.outstanding_amount, 2) as outstanding,
      (cr.due_date - ref.today) as days_remaining
    from public.customer_receivables cr
    cross join ref
    join public.transactions t on t.id = cr.transaction_id
    join public.customers c on c.id = cr.customer_id
    where cr.outstanding_amount > 0
      and cr.due_date <= ref.today + 3
    order by cr.due_date asc, cr.outstanding_amount desc, cr.id asc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'invoiceNumber', invoice_number,
        'customerName', customer_name,
        'dueDate', due_date,
        'outstanding', outstanding,
        'daysRemaining', days_remaining
      ) order by due_date asc, outstanding desc, id asc
    ),
    '[]'::jsonb
  )
  from due;
$$;

revoke all on function public.customer_receivable_due_reminders(date) from public, anon, authenticated;
grant execute on function public.customer_receivable_due_reminders(date) to service_role;

-- 7. Update request_customer_return to validate refund_method for TEMPO transactions
create or replace function public.request_customer_return(
  p_employee_id uuid,
  p_transaction_id uuid,
  p_refund_method public.payment_method,
  p_reason text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_tx public.transactions%rowtype;
  v_item jsonb;
  v_source record;
  v_return_id uuid := gen_random_uuid();
  v_return_item_id uuid;
  v_qty integer;
  v_previous integer;
  v_prev_sub numeric;
  v_prev_tax numeric;
  v_line_sub numeric;
  v_line_tax numeric;
  v_sub numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'RETURN_REASON_REQUIRED';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_RETURN_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'transaction_item_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_item->>'quantity_in_base', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_RETURN_ITEMS';
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct value->>'transaction_item_id') from jsonb_array_elements(p_items)) then
    raise exception 'DUPLICATE_RETURN_ITEM';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  if v_tx.status <> 'completed' then raise exception 'INVALID_TRANSACTION_STATE'; end if;

  -- TEMPO excess refunds (Opsi A) must specify a valid payout method for any excess after clearing receivable
  if v_tx.payment_method::text = 'tempo' and p_refund_method::text not in ('cash', 'qris', 'bank_transfer') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  -- Lock transaction items
  perform 1 from public.transaction_items ti
  where ti.id in (select (value->>'transaction_item_id')::uuid from jsonb_array_elements(p_items))
  order by ti.id for update;

  -- Validate cumulative unreturned & non-pending quantities
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items
    where id = (v_item->>'transaction_item_id')::uuid and transaction_id = p_transaction_id;
    if not found then raise exception 'INVALID_TRANSACTION_ITEM'; end if;

    select coalesce(sum(ri.quantity_in_base), 0),
           coalesce(sum(ri.refund_subtotal), 0),
           coalesce(sum(ri.refund_tax_amount), 0)
      into v_previous, v_prev_sub, v_prev_tax
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.transaction_item_id = v_source.id
      and r.source = 'customer'
      and r.status in ('pending_approval', 'approved', 'completed');

    if v_previous + v_qty > v_source.quantity_in_base then
      raise exception 'RETURN_QUANTITY_EXCEEDED';
    end if;

    v_line_sub := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.subtotal - v_prev_sub
                       else round(v_source.subtotal * v_qty / v_source.quantity_in_base, 2) end;
    v_line_tax := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.tax_amount - v_prev_tax
                       else round(v_source.tax_amount * v_qty / v_source.quantity_in_base, 2) end;
    v_sub := v_sub + v_line_sub;
    v_tax := v_tax + v_line_tax;
  end loop;

  insert into public.returns(
    id, source, transaction_id, refund_method, reason,
    processed_by, requested_by, refund_subtotal, refund_tax_amount, refund_total,
    status, refund_status
  ) values (
    v_return_id, 'customer', p_transaction_id, p_refund_method, btrim(p_reason),
    p_employee_id, p_employee_id, v_sub, v_tax, v_sub + v_tax,
    'pending_approval', 'pending'
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity_in_base')::integer;
    select * into v_source from public.transaction_items where id = (v_item->>'transaction_item_id')::uuid;

    select coalesce(sum(ri.quantity_in_base), 0),
           coalesce(sum(ri.refund_subtotal), 0),
           coalesce(sum(ri.refund_tax_amount), 0)
      into v_previous, v_prev_sub, v_prev_tax
    from public.return_items ri
    join public.returns r on r.id = ri.return_id
    where ri.transaction_item_id = v_source.id
      and r.source = 'customer'
      and r.id <> v_return_id
      and r.status in ('pending_approval', 'approved', 'completed');

    v_line_sub := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.subtotal - v_prev_sub
                       else round(v_source.subtotal * v_qty / v_source.quantity_in_base, 2) end;
    v_line_tax := case when v_previous + v_qty = v_source.quantity_in_base
                       then v_source.tax_amount - v_prev_tax
                       else round(v_source.tax_amount * v_qty / v_source.quantity_in_base, 2) end;

    v_return_item_id := gen_random_uuid();
    insert into public.return_items(
      id, return_id, product_id, transaction_item_id, quantity_in_base,
      refund_subtotal, refund_tax_amount, refund_total,
      condition, is_restocked
    ) values (
      v_return_item_id, v_return_id, v_source.product_id, v_source.id, v_qty,
      v_line_sub, v_line_tax, v_line_sub + v_line_tax,
      'good', false
    );
  end loop;

  return jsonb_build_object(
    'return_id', v_return_id,
    'status', 'pending_approval',
    'refund_subtotal', v_sub,
    'refund_tax_amount', v_tax,
    'refund_total', v_sub + v_tax
  );
end;
$$;

revoke all on function public.request_customer_return(uuid, uuid, public.payment_method, text, jsonb) from public, anon, authenticated;
grant execute on function public.request_customer_return(uuid, uuid, public.payment_method, text, jsonb) to service_role;

-- 8. Update approve_customer_return to implement Tempo Return Opsi A (reduce receivable first, excess cash/transfer refund, audit trail)
create or replace function public.approve_customer_return(
  p_employee_id uuid,
  p_return_id uuid,
  p_admin_notes text default null,
  p_item_conditions jsonb default null,
  p_confirm_refund boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_return public.returns%rowtype;
  v_tx public.transactions%rowtype;
  v_receivable public.customer_receivables%rowtype;
  v_business_date date;
  v_sequence integer;
  v_return_number text;
  v_item record;
  v_alloc record;
  v_available integer;
  v_remaining integer;
  v_take integer;
  v_credit_amount numeric(14,2) := 0;
  v_cash_refund_amount numeric(14,2) := 0;
  v_new_credit numeric(14,2);
  v_new_status text;
  v_before jsonb;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position <> 'owner_admin' then
    raise exception 'UNAUTHORIZED_ADMIN';
  end if;

  select * into v_return from public.returns where id = p_return_id for update;
  if not found then raise exception 'RETURN_NOT_FOUND'; end if;
  if v_return.source <> 'customer' or v_return.status <> 'pending_approval' then
    raise exception 'INVALID_RETURN_STATE';
  end if;

  select * into v_tx from public.transactions where id = v_return.transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;

  -- Generate sequential return number (RET-YYYYMMDD-XXXX)
  v_business_date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  insert into public.return_sequences(business_date, last_number)
  values (v_business_date, 1)
  on conflict (business_date) do update set last_number = public.return_sequences.last_number + 1
  returning last_number into v_sequence;

  v_return_number := 'RET-' || to_char(v_business_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 4, '0');

  -- Automatically restore stock for all approved items to original batches
  for v_item in select * from public.return_items where return_id = p_return_id loop
    if not v_item.is_restocked then
      v_remaining := v_item.quantity_in_base;
      for v_alloc in
        select tib.* from public.transaction_item_batches tib
        join public.product_batches pb on pb.id = tib.batch_id
        where tib.transaction_item_id = v_item.transaction_item_id
        order by pb.expired_date, pb.created_at, pb.id
      loop
        select v_alloc.quantity_in_base - coalesce(sum(rib.quantity_in_base), 0) into v_available
        from public.return_item_batches rib
        join public.return_items ri on ri.id = rib.return_item_id
        join public.returns r on r.id = ri.return_id
        where ri.transaction_item_id = v_item.transaction_item_id
          and rib.batch_id = v_alloc.batch_id
          and r.source = 'customer'
          and r.status in ('approved', 'completed');

        v_available := coalesce(v_available, v_alloc.quantity_in_base);
        if v_available > 0 and v_remaining > 0 then
          v_take := least(v_available, v_remaining);
          insert into public.return_item_batches(
            return_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot
          ) values (
            v_item.id, v_item.product_id, v_alloc.batch_id, v_take, v_alloc.cost_price_snapshot
          );
          update public.product_batches
          set quantity = quantity + v_take
          where id = v_alloc.batch_id;
          v_remaining := v_remaining - v_take;
        end if;
      end loop;

      if v_remaining <> 0 then
        raise exception 'INVALID_ORIGINAL_ALLOCATION';
      end if;

      update public.return_items
      set condition = 'good',
          is_restocked = true,
          restocked_at = clock_timestamp(),
          restocked_by = p_employee_id
      where id = v_item.id;
    end if;
  end loop;

  -- Tempo Return Opsi A: deduct outstanding receivable first, refund any remaining excess via refund_method
  if v_tx.payment_method::text = 'tempo' then
    select * into v_receivable
    from public.customer_receivables
    where transaction_id = v_tx.id
    for update;

    if not found then
      raise exception 'RECEIVABLE_NOT_FOUND';
    end if;

    v_credit_amount := round(least(v_receivable.outstanding_amount, v_return.refund_total), 2);
    v_cash_refund_amount := round(v_return.refund_total - v_credit_amount, 2);

    v_before := jsonb_build_object(
      'paid_amount', v_receivable.paid_amount,
      'credited_return_amount', v_receivable.credited_return_amount,
      'outstanding_amount', v_receivable.outstanding_amount,
      'payment_status', v_receivable.payment_status
    );

    v_new_credit := v_receivable.credited_return_amount + v_credit_amount;
    v_new_status := case
      when v_receivable.paid_amount + v_new_credit >= v_receivable.original_amount then 'paid'
      when v_receivable.paid_amount > 0 then 'partial'
      else 'unpaid'
    end;

    update public.customer_receivables
    set credited_return_amount = v_new_credit,
        payment_status = v_new_status
    where id = v_receivable.id
    returning * into v_receivable;

    insert into public.security_audit_events (actor_employee_id, action, target_id, before_value, after_value)
    values (
      p_employee_id,
      'receivable.return_credit',
      v_receivable.id::text,
      v_before,
      jsonb_build_object(
        'return_id', p_return_id,
        'return_number', v_return_number,
        'refund_total', v_return.refund_total,
        'receivable_credit_amount', v_credit_amount,
        'cash_refund_amount', v_cash_refund_amount,
        'refund_method', v_return.refund_method,
        'paid_amount', v_receivable.paid_amount,
        'credited_return_amount', v_receivable.credited_return_amount,
        'outstanding_amount', v_receivable.outstanding_amount,
        'payment_status', v_receivable.payment_status
      )
    );
  else
    v_credit_amount := 0;
    v_cash_refund_amount := v_return.refund_total;
  end if;

  update public.returns
  set return_number = v_return_number,
      business_date = v_business_date,
      status = 'approved',
      refund_status = 'completed',
      receivable_credit_amount = v_credit_amount,
      cash_refund_amount = v_cash_refund_amount,
      reviewed_by = p_employee_id,
      reviewed_at = clock_timestamp(),
      admin_notes = btrim(coalesce(p_admin_notes, 'Disetujui')),
      refund_confirmed_at = clock_timestamp(),
      refund_confirmed_by = p_employee_id
  where id = p_return_id;

  return jsonb_build_object(
    'return_id', p_return_id,
    'return_number', v_return_number,
    'status', 'approved',
    'refund_status', 'completed',
    'refund_total', v_return.refund_total,
    'receivable_credit_amount', v_credit_amount,
    'cash_refund_amount', v_cash_refund_amount
  );
end;
$$;

revoke all on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.approve_customer_return(uuid, uuid, text, jsonb, boolean) to service_role;

-- 9. Update Financial Reports for Accrual TEMPO Revenue/COGS and Cash-Basis Payment Receipts
-- 9a. sales_gross_profit_report (also powers profit_loss_report)
create or replace function public.sales_gross_profit_report(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  with sales as materialized (
    select id, subtotal, tax_amount
    from public.transactions
    where status = 'completed'
      and (
        (payment_method::text in ('cash', 'tempo') and business_date between p_from and p_to)
        or (payment_method::text not in ('cash', 'tempo')
          and payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
          and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
      )
  ), refunds as materialized (
    select id, refund_subtotal, refund_tax_amount
    from public.returns
    where source = 'customer'
      and status in ('approved', 'completed')
      and business_date between p_from and p_to
  ), sale_totals as (
    select count(*) as transaction_count, coalesce(sum(subtotal), 0) as revenue,
      coalesce(sum(tax_amount), 0) as tax from sales
  ), refund_totals as (
    select coalesce(sum(refund_subtotal), 0) as refund,
      coalesce(sum(refund_tax_amount), 0) as refunded_tax from refunds
  ), sold_cost as (
    select coalesce(sum(b.quantity_in_base * b.cost_price_snapshot), 0) as cogs
    from sales s join public.transaction_items i on i.transaction_id = s.id
    join public.transaction_item_batches b on b.transaction_item_id = i.id
  ), returned_cost as (
    select coalesce(sum(b.quantity_in_base * b.cost_price_snapshot), 0) as cogs
    from refunds r join public.return_items i on i.return_id = r.id
    join public.return_item_batches b on b.return_item_id = i.id
  ), totals as (
    select s.transaction_count, s.revenue, s.tax, r.refund, r.refunded_tax,
      sc.cogs, rc.cogs as returned_cogs, s.revenue - r.refund as net_revenue,
      s.revenue - r.refund - sc.cogs + rc.cogs as gross_profit
    from sale_totals s cross join refund_totals r cross join sold_cost sc cross join returned_cost rc
  )
  select jsonb_build_object(
    'completedTransactionCount', transaction_count,
    'salesRevenue', round(revenue, 2)::text,
    'salesTax', round(tax, 2)::text,
    'refunds', round(refund, 2)::text,
    'refundedTax', round(refunded_tax, 2)::text,
    'netRevenue', round(net_revenue, 2)::text,
    'cogs', round(cogs, 2)::text,
    'returnedCogs', round(returned_cogs, 2)::text,
    'grossProfit', round(gross_profit, 2)::text,
    'grossMarginPercent', case when net_revenue = 0 then null
      else round(gross_profit / net_revenue * 100, 2)::text end
  ) from totals;
$$;

revoke all on function public.sales_gross_profit_report(date, date) from public, anon, authenticated;
grant execute on function public.sales_gross_profit_report(date, date) to service_role;

-- 9b. product_performance_report
create or replace function public.product_performance_report(p_from date, p_to date, p_sort text default 'quantity')
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  with sales as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.subtotal) as revenue
    from public.transactions t join public.transaction_items i on i.transaction_id = t.id
    where t.status = 'completed' and (
      (t.payment_method::text in ('cash', 'tempo') and t.business_date between p_from and p_to)
      or (t.payment_method::text not in ('cash', 'tempo')
        and t.payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
        and t.payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')))
    group by i.product_id
  ), refunds as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.refund_subtotal) as revenue
    from public.returns r join public.return_items i on i.return_id = r.id
    where r.source = 'customer'
      and r.status in ('approved', 'completed')
      and r.business_date between p_from and p_to
    group by i.product_id
  ), stock as (
    select product_id, sum(quantity) as quantity from public.product_batches
    where quantity > 0 and (expired_date is null or expired_date >= (now() at time zone 'Asia/Jakarta')::date)
    group by product_id
  ), performance as (
    select p.id, p.name, p.sku, coalesce(s.quantity, 0) as sold,
      coalesce(r.quantity, 0) as returned, coalesce(s.quantity, 0) - coalesce(r.quantity, 0) as net_quantity,
      coalesce(s.revenue, 0) - coalesce(r.revenue, 0) as net_revenue
    from public.products p left join sales s on s.product_id = p.id
      left join refunds r on r.product_id = p.id
    where s.product_id is not null or r.product_id is not null
  ), unsold as (
    select p.id, p.name, p.sku, p.base_unit, coalesce(st.quantity, 0) as available_stock
    from public.products p left join sales s on s.product_id = p.id
      left join stock st on st.product_id = p.id
    where p.is_active and s.product_id is null
  )
  select jsonb_build_object(
    'bestSelling', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'quantitySold', sold::text,
      'returnedQuantity', returned::text, 'netQuantity', net_quantity::text,
      'netRevenue', round(net_revenue, 2)::text)
      order by case when p_sort = 'revenue' then net_revenue else net_quantity end desc, name, id)
      from performance), '[]'::jsonb),
    'unsold', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'baseUnit', base_unit,
      'availableStock', available_stock::text, 'hasStock', available_stock > 0)
      order by (available_stock > 0) desc, name, id) from unsold), '[]'::jsonb)
  );
$$;

revoke all on function public.product_performance_report(date, date, text) from public, anon, authenticated;
grant execute on function public.product_performance_report(date, date, text) to service_role;

-- 9c. payment_refund_report: Cash-basis receipts only (direct Cash/QRIS/Bank Transfer sales + customer_receivable_payments)
-- Unpaid TEMPO checkout never appears here; TEMPO Opsi A returns only subtract actual cash_refund_amount excess.
create or replace function public.payment_refund_report(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  with methods(method, ordering) as (values ('cash', 1), ('qris', 2), ('bank_transfer', 3)),
  direct_sales_receipts as (
    select payment_method::text as method, count(*) as count, coalesce(sum(total_amount), 0) as amount
    from public.transactions
    where status = 'completed'
      and (
        (payment_method::text = 'cash' and business_date between p_from and p_to)
        or (payment_method::text in ('qris', 'bank_transfer')
          and payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
          and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
      )
    group by payment_method
  ),
  receivable_installment_receipts as (
    select payment_method::text as method, count(*) as count, coalesce(sum(amount), 0) as amount
    from public.customer_receivable_payments
    where payment_date between p_from and p_to
    group by payment_method
  ),
  completed as (
    select method, sum(count) as count, sum(amount) as amount
    from (
      select method, count, amount from direct_sales_receipts
      union all
      select method, count, amount from receivable_installment_receipts
    ) combined
    group by method
  ),
  refunds as (
    select refund_method::text as method, sum(coalesce(cash_refund_amount, refund_total)) as amount
    from public.returns
    where source = 'customer'
      and status in ('approved', 'completed')
      and business_date between p_from and p_to
      and coalesce(cash_refund_amount, refund_total) > 0
    group by refund_method
  ),
  pending as (
    select payment_method::text as method, count(*) as count, sum(total_amount) as amount
    from public.transactions
    where status = 'pending_payment' and business_date between p_from and p_to
    group by payment_method
  )
  select jsonb_build_object('methods', jsonb_agg(jsonb_build_object(
    'method', m.method,
    'completedCount', coalesce(c.count, 0),
    'paymentsReceived', round(coalesce(c.amount, 0), 2)::text,
    'customerRefunds', round(coalesce(r.amount, 0), 2)::text,
    'netPayments', round(coalesce(c.amount, 0) - coalesce(r.amount, 0), 2)::text,
    'pendingCount', coalesce(p.count, 0),
    'pendingAmount', round(coalesce(p.amount, 0), 2)::text
  ) order by m.ordering))
  from methods m left join completed c on c.method = m.method
    left join refunds r on r.method = m.method
    left join pending p on p.method = m.method;
$$;

revoke all on function public.payment_refund_report(date, date) from public, anon, authenticated;
grant execute on function public.payment_refund_report(date, date) to service_role;

-- 9d. dashboard_analytics_report
create or replace function public.dashboard_analytics_report(p_from date, p_to date, p_year integer)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
     or p_year is null or p_year < 1900 or p_year > 9998 then
    raise exception 'INVALID_DASHBOARD_PERIOD' using errcode = '22023';
  end if;
  return (
    with recognized as materialized (
      select case when payment_method::text in ('cash', 'tempo') then business_date
        else (payment_confirmed_at at time zone 'Asia/Jakarta')::date end as day,
        subtotal
      from public.transactions
      where status = 'completed' and (
        (payment_method::text in ('cash', 'tempo') and (business_date between p_from and p_to
          or business_date >= make_date(p_year, 1, 1) and business_date < make_date(p_year + 1, 1, 1)))
        or (payment_method::text not in ('cash', 'tempo') and (
          (payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
           and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
          or (payment_confirmed_at >= (make_date(p_year, 1, 1)::timestamp at time zone 'Asia/Jakarta')
           and payment_confirmed_at < (make_date(p_year + 1, 1, 1)::timestamp at time zone 'Asia/Jakarta'))))
      )
    ), daily as (
      select day, sum(subtotal) as revenue, count(*) as count from recognized
      where day between p_from and p_to group by day
    ), monthly as (
      select extract(month from day)::integer as month, sum(subtotal) as revenue, count(*) as count
      from recognized where day >= make_date(p_year, 1, 1) and day < make_date(p_year + 1, 1, 1)
      group by extract(month from day)
    )
    select jsonb_build_object(
      'summary', public.sales_gross_profit_report(p_from, p_to),
      'payments', public.payment_refund_report(p_from, p_to)->'methods',
      'products', coalesce((select jsonb_agg(item order by ordinal)
        from jsonb_array_elements(public.product_performance_report(p_from, p_to, 'quantity')->'bestSelling')
          with ordinality as ranking(item, ordinal) where ordinal <= 5), '[]'::jsonb),
      'daily', (select jsonb_agg(jsonb_build_object(
        'date', (p_from + n)::text, 'revenue', round(coalesce(d.revenue, 0), 2)::text,
        'count', coalesce(d.count, 0)) order by n)
        from generate_series(0, p_to - p_from) n left join daily d on d.day = p_from + n),
      'monthly', (select jsonb_agg(jsonb_build_object(
        'date', make_date(p_year, n, 1)::text, 'revenue', round(coalesce(m.revenue, 0), 2)::text,
        'count', coalesce(m.count, 0)) order by n)
        from generate_series(1, 12) n left join monthly m on m.month = n)
    )
  );
end;
$$;

revoke all on function public.dashboard_analytics_report(date, date, integer) from public, anon, authenticated;
grant execute on function public.dashboard_analytics_report(date, date, integer) to service_role;

