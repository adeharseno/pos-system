-- Migration 0069: Master Customers, TEMPO Payment Method, Customer Receivables Base, and Atomic Tempo Checkout
-- Preserves 0067 zero-sales-tax, 0068 immediate QRIS/Bank Transfer completion, 0063 BPJS susulan/empty cart,
-- and enforces strict separation between transaction sales status ('completed') and receivable payment status ('unpaid').

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- 1. Extend payment_method enum with 'tempo'
alter type public.payment_method add value if not exists 'tempo';

-- 2. Master Customers table
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  phone text check (phone is null or length(btrim(phone)) between 1 and 50),
  address text check (address is null or length(btrim(address)) <= 1000),
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  normalized_phone text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_name_trgm
  on public.customers using gin (lower(name) gin_trgm_ops);
create index if not exists idx_customers_active_name
  on public.customers (is_active, lower(btrim(name)), id);
create unique index if not exists uq_customers_active_identity
  on public.customers (lower(btrim(name)), coalesce(normalized_phone, ''))
  where is_active;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
drop policy if exists "deny_all_client_access" on public.customers;
create policy "deny_all_client_access"
  on public.customers for all to authenticated, anon using (false);
revoke all on public.customers from public, anon, authenticated, service_role;
grant select, insert, update on public.customers to service_role;

-- 3. Idempotent customer creation requests table + RPC
create table if not exists public.customer_requests (
  request_id uuid primary key,
  customer_id uuid not null references public.customers(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.customer_requests enable row level security;
drop policy if exists "deny_all_client_access" on public.customer_requests;
create policy "deny_all_client_access"
  on public.customer_requests for all to authenticated, anon using (false);
revoke all on public.customer_requests from public, anon, authenticated, service_role;
grant select, insert on public.customer_requests to service_role;

create or replace function public.create_customer_idempotent(
  p_request_id uuid,
  p_employee_id uuid,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_name text;
  v_phone text;
  v_address text;
  v_notes text;
  v_norm_phone text;
  v_fingerprint jsonb;
  v_existing_req public.customer_requests%rowtype;
  v_customer public.customers%rowtype;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception 'INVALID_CUSTOMER_INPUT';
  end if;

  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_address := nullif(btrim(coalesce(p_address, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  if v_name is null or length(v_name) > 200
     or (v_phone is not null and length(v_phone) > 50)
     or (v_address is not null and length(v_address) > 1000)
     or (v_notes is not null and length(v_notes) > 1000) then
    raise exception 'INVALID_CUSTOMER_INPUT';
  end if;

  v_norm_phone := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');
  v_fingerprint := jsonb_build_object(
    'name', lower(v_name),
    'phone', coalesce(v_norm_phone, ''),
    'address', coalesce(v_address, ''),
    'notes', coalesce(v_notes, '')
  );

  perform pg_advisory_xact_lock(hashtextextended('customer_req:' || p_request_id::text, 69001));

  select * into v_existing_req
  from public.customer_requests
  where request_id = p_request_id
  for update;

  if found then
    if v_existing_req.employee_id <> p_employee_id or v_existing_req.fingerprint <> v_fingerprint then
      raise exception 'CUSTOMER_REQUEST_CONFLICT';
    end if;
    return v_existing_req.result || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('customer_identity:' || lower(v_name) || ':' || coalesce(v_norm_phone, ''), 69002)
  );

  if exists (
    select 1 from public.customers
    where is_active
      and lower(btrim(name)) = lower(v_name)
      and coalesce(normalized_phone, '') = coalesce(v_norm_phone, '')
  ) then
    raise exception 'DUPLICATE_CUSTOMER';
  end if;

  insert into public.customers (name, phone, address, notes, created_by)
  values (v_name, v_phone, v_address, v_notes, p_employee_id)
  returning * into v_customer;

  v_result := jsonb_build_object(
    'id', v_customer.id,
    'name', v_customer.name,
    'phone', v_customer.phone,
    'address', v_customer.address,
    'notes', v_customer.notes,
    'replayed', false
  );

  insert into public.customer_requests (request_id, customer_id, employee_id, fingerprint, result)
  values (p_request_id, v_customer.id, p_employee_id, v_fingerprint, v_result);

  insert into public.security_audit_events (actor_employee_id, action, target_id, before_value, after_value)
  values (
    p_employee_id,
    'customer.create',
    v_customer.id::text,
    null,
    jsonb_build_object('name', v_customer.name, 'phone', v_customer.phone)
  );

  return v_result;
end;
$$;

revoke all on function public.create_customer_idempotent(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_customer_idempotent(uuid, uuid, text, text, text, text) to service_role;

-- 4. Extend transactions table with customer_id and update payment shape constraint
alter table public.transactions
  add column if not exists customer_id uuid references public.customers(id) on delete restrict;

create index if not exists idx_transactions_customer
  on public.transactions(customer_id)
  where customer_id is not null;

alter table public.transactions drop constraint if exists chk_transaction_payment_shape;
alter table public.transactions add constraint chk_transaction_payment_shape check (
  (
    payment_method = 'cash'
    and status in ('completed', 'voided')
    and cash_received is not null and cash_received >= total_amount
    and cash_change is not null and cash_change = cash_received - total_amount
    and payment_confirmed_at is not null and payment_confirmed_by is not null
  )
  or (
    payment_method::text in ('qris', 'bank_transfer')
    and cash_received is null and cash_change is null
    and (
      (status = 'pending_payment' and payment_confirmed_at is null and payment_confirmed_by is null)
      or (status = 'completed' and payment_confirmed_at is not null and payment_confirmed_by is not null)
      or status = 'voided'
    )
  )
  or (
    payment_method::text = 'bpjs'
    and status = 'completed'
    and cash_received = 0 and cash_change = 0
    and payment_confirmed_at is not null and payment_confirmed_by is not null
  )
  or (
    payment_method::text = 'tempo'
    and customer_id is not null
    and status = 'completed'
    and cash_received is null and cash_change is null
    and payment_confirmed_at is null and payment_confirmed_by is null
  )
);

-- 5. Authoritative customer_receivables table (1:1 per Tempo transaction)
create table if not exists public.customer_receivables (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  original_amount numeric(14,2) not null check (original_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  credited_return_amount numeric(14,2) not null default 0 check (credited_return_amount >= 0),
  outstanding_amount numeric(14,2) generated always as (original_amount - paid_amount - credited_return_amount) stored,
  due_date date not null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  created_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_customer_receivables_balance_non_negative check (
    paid_amount + credited_return_amount <= original_amount
  ),
  constraint chk_customer_receivables_status_consistent check (
    (payment_status = 'paid' and paid_amount + credited_return_amount = original_amount)
    or (payment_status = 'partial' and paid_amount > 0 and paid_amount + credited_return_amount < original_amount)
    or (payment_status = 'unpaid' and paid_amount = 0 and paid_amount + credited_return_amount < original_amount)
  )
);

create index if not exists idx_customer_receivables_customer
  on public.customer_receivables(customer_id);
create index if not exists idx_customer_receivables_due_open
  on public.customer_receivables(due_date, id)
  where payment_status <> 'paid';
create index if not exists idx_customer_receivables_status
  on public.customer_receivables(payment_status, due_date);

drop trigger if exists trg_customer_receivables_updated_at on public.customer_receivables;
create trigger trg_customer_receivables_updated_at
  before update on public.customer_receivables
  for each row execute function public.set_updated_at();

alter table public.customer_receivables enable row level security;
drop policy if exists "deny_all_client_access" on public.customer_receivables;
create policy "deny_all_client_access"
  on public.customer_receivables for all to authenticated, anon using (false);
revoke all on public.customer_receivables from public, anon, authenticated, service_role;
grant select, insert, update on public.customer_receivables to service_role;

-- 6. Forbid voiding completed TEMPO transactions in void_transaction RPC
create or replace function public.void_transaction(
  p_transaction_id uuid,
  p_employee_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx public.transactions%rowtype;
  v_employee public.employees%rowtype;
  v_alloc record;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'VOID_REASON_REQUIRED';
  end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.status = 'voided' then
    raise exception 'TRANSACTION_ALREADY_VOIDED';
  end if;
  if v_tx.payment_method = 'qris' and (v_tx.status = 'completed' or v_tx.payment_confirmed_at is not null) then
    raise exception 'PAID_TRANSACTION_REQUIRES_RETURN';
  end if;
  if v_tx.payment_method::text = 'tempo' then
    raise exception 'TEMPO_TRANSACTION_REQUIRES_RETURN';
  end if;
  if exists(select 1 from public.returns where transaction_id = p_transaction_id and source = 'customer') then
    raise exception 'TRANSACTION_HAS_RETURNS';
  end if;
  perform 1 from public.product_batches pb
    join public.transaction_item_batches tib on tib.batch_id = pb.id
    join public.transaction_items ti on ti.id = tib.transaction_item_id
    where ti.transaction_id = p_transaction_id
    order by pb.product_id, pb.expired_date, pb.created_at, pb.id
    for update of pb;
  if exists(
    select 1 from public.transaction_items ti
    join public.transaction_item_batches tib on tib.transaction_item_id = ti.id
    join public.stock_opname_items oi on oi.batch_id = tib.batch_id
    join public.stock_opname_sessions os on os.id = oi.session_id
    where ti.transaction_id = p_transaction_id and os.status = 'in_progress'
  ) then
    raise exception 'STOCK_OPNAME_IN_PROGRESS';
  end if;
  for v_alloc in
    select tib.batch_id, tib.quantity_in_base
    from public.transaction_items ti
    join public.transaction_item_batches tib on tib.transaction_item_id = ti.id
    where ti.transaction_id = p_transaction_id
    order by tib.batch_id
  loop
    update public.product_batches set quantity = quantity + v_alloc.quantity_in_base where id = v_alloc.batch_id;
  end loop;
  update public.transactions
  set status = 'voided',
      voided_at = clock_timestamp(),
      voided_by = p_employee_id,
      void_reason = btrim(p_reason)
  where id = p_transaction_id;
  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'voided');
end;
$$;

revoke all on function public.void_transaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.void_transaction(uuid, uuid, text) to service_role;

-- 7. Atomic Checkout Chain: extend checkout_transaction, checkout_transaction_with_prescription, checkout_transaction_idempotent
-- Drop previous overloaded signatures so 5-arg and 7-arg calls resolve cleanly to the updated defaults.
drop function if exists public.checkout_transaction_idempotent(uuid, uuid, public.payment_method, jsonb, numeric, jsonb, jsonb);
drop function if exists public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb);
drop function if exists public.checkout_transaction(uuid, public.payment_method, jsonb, numeric, jsonb);

create or replace function public.checkout_transaction(
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null,
  p_customer_id uuid default null,
  p_due_date date default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_unit record;
  v_batch record;
  v_employee record;
  v_customer record;
  v_transaction_id uuid := gen_random_uuid();
  v_transaction_item_id uuid;
  v_receivable_id uuid;
  v_business_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_invoice_sequence integer;
  v_invoice_number text;
  v_quantity integer;
  v_quantity_base integer;
  v_remaining integer;
  v_take integer;
  v_line_subtotal numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_requires_prescription boolean := false;
  v_status public.transaction_status;
begin
  select id, position, is_active into v_employee
  from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_CART';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'product_unit_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_CART';
    end if;
  end loop;

  perform 1
  from public.product_units u
  join public.products p on p.id = u.product_id
  where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
  order by p.id, u.id
  for share of p, u;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select p.id as product_id, p.is_active, p.requires_prescription,
           u.id as unit_id, u.conversion_to_base, u.selling_price
      into v_unit
    from public.product_units u
    join public.products p on p.id = u.product_id
    where u.id = (v_item->>'product_unit_id')::uuid;
    if not found or not v_unit.is_active then
      raise exception 'INVALID_PRODUCT_UNIT';
    end if;
    v_quantity_base := v_quantity * v_unit.conversion_to_base;
    if v_quantity_base <= 0 then raise exception 'INVALID_CART'; end if;
    v_line_subtotal := round(v_quantity * v_unit.selling_price, 2);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_requires_prescription := v_requires_prescription or v_unit.requires_prescription;
  end loop;

  if v_requires_prescription and (
    p_prescription is null or jsonb_typeof(p_prescription) <> 'object'
    or btrim(coalesce(p_prescription->>'doctor_name', '')) = ''
    or btrim(coalesce(p_prescription->>'patient_name', '')) = ''
  ) then raise exception 'PRESCRIPTION_REQUIRED'; end if;

  -- Sales tax is permanently disabled; transaction total equals subtotal.
  v_total := v_subtotal;

  if p_payment_method::text not in ('cash', 'qris', 'bank_transfer', 'tempo') then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;
  if p_payment_method::text = 'cash' and (p_cash_received is null or p_cash_received < v_total) then
    raise exception 'INSUFFICIENT_CASH';
  end if;
  if p_payment_method::text in ('qris', 'bank_transfer', 'tempo') and p_cash_received is not null then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;
  if p_payment_method::text <> 'tempo' and (p_customer_id is not null or p_due_date is not null) then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;

  if p_payment_method::text = 'tempo' then
    if p_customer_id is null then raise exception 'CUSTOMER_REQUIRED'; end if;
    if p_due_date is null then raise exception 'DUE_DATE_REQUIRED'; end if;
    if p_due_date < v_business_date then raise exception 'INVALID_DUE_DATE'; end if;
    if v_total <= 0 then raise exception 'TEMPO_ZERO_TOTAL_NOT_ALLOWED'; end if;

    select id, name, is_active into v_customer
    from public.customers
    where id = p_customer_id
    for share;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
    if not v_customer.is_active then raise exception 'CUSTOMER_INACTIVE'; end if;
  end if;

  -- Keep the existing deterministic lock order; unknown expiry sorts last.
  perform 1 from public.product_batches pb
  where pb.product_id in (
    select distinct u.product_id from public.product_units u
    where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
  ) and pb.quantity > 0
    and (pb.expired_date is null or pb.expired_date >= v_business_date)
  order by pb.product_id, pb.expired_date asc nulls last, pb.created_at, pb.id
  for update;

  if exists (
    select 1 from public.stock_opname_items oi
    join public.stock_opname_sessions os on os.id = oi.session_id and os.status = 'in_progress'
    join public.product_batches pb on pb.id = oi.batch_id
    where pb.product_id in (
      select distinct u.product_id from public.product_units u
      where u.id in (select (value->>'product_unit_id')::uuid from jsonb_array_elements(p_items))
    ) and pb.quantity > 0
      and (pb.expired_date is null or pb.expired_date >= v_business_date)
  ) then raise exception 'STOCK_OPNAME_IN_PROGRESS'; end if;

  for v_batch in
    select u.product_id, sum((e.value->>'quantity')::integer * u.conversion_to_base)::integer needed
    from jsonb_array_elements(p_items) e(value)
    join public.product_units u on u.id = (e.value->>'product_unit_id')::uuid
    group by u.product_id order by u.product_id
  loop
    if coalesce((select sum(quantity) from public.product_batches
      where product_id = v_batch.product_id and quantity > 0
        and (expired_date is null or expired_date >= v_business_date)), 0) < v_batch.needed then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  insert into public.invoice_sequences(business_date, last_number)
  values (v_business_date, 1)
  on conflict (business_date) do update set last_number = public.invoice_sequences.last_number + 1
  returning last_number into v_invoice_sequence;
  v_invoice_number := 'INV-' || to_char(v_business_date, 'YYYYMMDD') || '-' || lpad(v_invoice_sequence::text, 4, '0');
  v_status := 'completed'::public.transaction_status;

  insert into public.transactions(
    id, invoice_number, business_date, cashier_id, customer_id,
    subtotal, tax_amount, total_amount, payment_method, cash_received, cash_change,
    payment_confirmed_at, payment_confirmed_by, status
  ) values (
    v_transaction_id, v_invoice_number, v_business_date, p_employee_id,
    case when p_payment_method::text = 'tempo' then p_customer_id else null end,
    v_subtotal, 0, v_total, p_payment_method,
    case when p_payment_method::text = 'cash' then p_cash_received else null end,
    case when p_payment_method::text = 'cash' then p_cash_received - v_total else null end,
    case when p_payment_method::text = 'tempo' then null else clock_timestamp() end,
    case when p_payment_method::text = 'tempo' then null else p_employee_id end,
    v_status
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item->>'quantity')::integer;
    select p.id as product_id, p.name as product_name,
           u.id as unit_id, u.unit_name, u.conversion_to_base, u.selling_price into v_unit
    from public.product_units u join public.products p on p.id = u.product_id
    where u.id = (v_item->>'product_unit_id')::uuid;
    v_quantity_base := v_quantity * v_unit.conversion_to_base;
    v_line_subtotal := round(v_quantity * v_unit.selling_price, 2);
    v_transaction_item_id := gen_random_uuid();
    insert into public.transaction_items(
      id, transaction_id, product_id, product_unit_id, product_name_snapshot,
      unit_name_snapshot, quantity_in_unit,
      conversion_to_base_snapshot, quantity_in_base, unit_price, discount_amount, tax_rate_snapshot,
      subtotal, tax_amount, total_amount
    ) values (
      v_transaction_item_id, v_transaction_id, v_unit.product_id, v_unit.unit_id,
      v_unit.product_name, v_unit.unit_name, v_quantity,
      v_unit.conversion_to_base, v_quantity_base, v_unit.selling_price, 0, 0,
      v_line_subtotal, 0, v_line_subtotal
    );
    v_remaining := v_quantity_base;
    for v_batch in select id, quantity, cost_price from public.product_batches
      where product_id = v_unit.product_id and quantity > 0
        and (expired_date is null or expired_date >= v_business_date)
      order by expired_date asc nulls last, created_at, id
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_batch.quantity);
      insert into public.transaction_item_batches(transaction_item_id, product_id, batch_id, quantity_in_base, cost_price_snapshot)
      values (v_transaction_item_id, v_unit.product_id, v_batch.id, v_take, v_batch.cost_price);
      update public.product_batches set quantity = quantity - v_take where id = v_batch.id;
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;

  if v_requires_prescription then
    insert into public.transaction_prescriptions(transaction_id, prescription_number, doctor_name, patient_name, photo_url)
    values (v_transaction_id, nullif(btrim(p_prescription->>'prescription_number'), ''),
      btrim(p_prescription->>'doctor_name'), btrim(p_prescription->>'patient_name'),
      nullif(btrim(p_prescription->>'photo_url'), ''));
  end if;

  if p_payment_method::text = 'tempo' then
    insert into public.customer_receivables(
      transaction_id, customer_id, original_amount, paid_amount,
      credited_return_amount, due_date, payment_status, created_by
    ) values (
      v_transaction_id, p_customer_id, v_total, 0,
      0, p_due_date, 'unpaid', p_employee_id
    ) returning id into v_receivable_id;

    return jsonb_build_object(
      'transaction_id', v_transaction_id,
      'invoice_number', v_invoice_number,
      'status', v_status,
      'subtotal', v_subtotal,
      'tax_amount', 0,
      'total_amount', v_total,
      'cash_change', null,
      'receivable_id', v_receivable_id,
      'customer_id', p_customer_id,
      'customer_name', v_customer.name,
      'due_date', p_due_date,
      'payment_status', 'unpaid'
    );
  end if;

  return jsonb_build_object('transaction_id', v_transaction_id, 'invoice_number', v_invoice_number,
    'status', v_status, 'subtotal', v_subtotal, 'tax_amount', 0, 'total_amount', v_total,
    'cash_change', case when p_payment_method::text = 'cash' then p_cash_received - v_total else null end);
end;
$$;

revoke all on function public.checkout_transaction(uuid, public.payment_method, jsonb, numeric, jsonb, uuid, date) from public, anon, authenticated;
grant execute on function public.checkout_transaction(uuid, public.payment_method, jsonb, numeric, jsonb, uuid, date) to service_role;

create or replace function public.checkout_transaction_with_prescription(
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null,
  p_customer_id uuid default null,
  p_due_date date default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_transaction_id uuid;
  v_category text;
  v_patient_name text;
  v_bpjs_number text;
  v_prescription_number text;
  v_prescription_origin text;
  v_prescription_date date;
  v_effective_method public.payment_method;
begin
  if p_prescription is null or jsonb_typeof(p_prescription) <> 'object' then
    raise exception 'PRESCRIPTION_METADATA_REQUIRED';
  end if;
  v_category := lower(btrim(coalesce(p_prescription->>'prescription_category', '')));
  if v_category not in ('umum', 'bpjs', 'bebas') then
    raise exception 'INVALID_PRESCRIPTION_CATEGORY';
  end if;
  if v_category = 'bpjs' and p_payment_method::text = 'tempo' then
    raise exception 'TEMPO_BPJS_NOT_ALLOWED';
  end if;
  if (v_category = 'bpjs') <> (p_payment_method::text = 'bpjs') then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;
  if v_category = 'bpjs' and coalesce(p_cash_received, 0) <> 0 then
    raise exception 'INVALID_PAYMENT_DATA';
  end if;

  v_patient_name := case when v_category = 'bebas' then null else nullif(btrim(p_prescription->>'patient_name'), '') end;
  v_bpjs_number := case when v_category = 'bpjs' then nullif(btrim(p_prescription->>'bpjs_number'), '') else null end;
  v_prescription_number := case when v_category = 'bebas' then null else nullif(btrim(p_prescription->>'prescription_number'), '') end;
  v_prescription_origin := case when v_category = 'bebas' then null else nullif(btrim(p_prescription->>'prescription_origin'), '') end;
  if v_category <> 'bebas' and nullif(btrim(p_prescription->>'prescription_date'), '') is not null then
    v_prescription_date := (p_prescription->>'prescription_date')::date;
  end if;
  if v_category = 'bpjs' and v_bpjs_number is null then raise exception 'BPJS_NUMBER_REQUIRED'; end if;

  v_effective_method := case when v_category = 'bpjs' then 'qris'::public.payment_method else p_payment_method end;
  v_result := public.checkout_transaction(
    p_employee_id,
    v_effective_method,
    p_items,
    case when v_category = 'bpjs' then null else p_cash_received end,
    jsonb_build_object(
      'prescription_number', v_prescription_number,
      'doctor_name', case when v_category = 'bebas' then '__BEBAS__' else v_prescription_origin end,
      'patient_name', case when v_category = 'bebas' then '__BEBAS__' else v_patient_name end
    ),
    case when v_category = 'bpjs' then null else p_customer_id end,
    case when v_category = 'bpjs' then null else p_due_date end
  );
  v_transaction_id := (v_result->>'transaction_id')::uuid;

  if v_category = 'bpjs' then
    update public.transactions
    set payment_method = p_payment_method,
        status = 'completed',
        cash_received = 0,
        cash_change = 0,
        payment_confirmed_at = clock_timestamp(),
        payment_confirmed_by = p_employee_id
    where id = v_transaction_id;
    v_result := v_result || jsonb_build_object('status', 'completed', 'cash_change', 0);
  end if;

  update public.transaction_prescriptions
  set prescription_number = v_prescription_number,
      doctor_name = v_prescription_origin,
      patient_name = v_patient_name,
      prescription_category = v_category,
      bpjs_number = v_bpjs_number,
      prescription_origin = v_prescription_origin,
      prescription_date = v_prescription_date
  where transaction_id = v_transaction_id;

  if not found then
    insert into public.transaction_prescriptions(
      transaction_id, prescription_number, doctor_name, patient_name,
      prescription_category, bpjs_number, prescription_origin, prescription_date
    ) values (
      v_transaction_id, v_prescription_number, v_prescription_origin, v_patient_name,
      v_category, v_bpjs_number, v_prescription_origin, v_prescription_date
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb, uuid, date) from public, anon, authenticated;
grant execute on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb, uuid, date) to service_role;

create or replace function public.checkout_transaction_idempotent(
  p_request_id uuid,
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null,
  p_supplementary_items jsonb default null,
  p_customer_id uuid default null,
  p_due_date date default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint jsonb;
  v_request public.checkout_requests%rowtype;
  v_result jsonb;
  v_transaction_id uuid;
  v_item jsonb;
  v_drug_name text;
  v_quantity integer;
  v_unit_price numeric(15,2);
  v_req_key text;
  v_extra_subtotal numeric(15,2) := 0;
  v_delivery_date date;
  v_idx integer := 0;
  v_business_date date;
  v_invoice_sequence integer;
  v_invoice_number text;
  v_employee record;
  v_patient_name text;
  v_bpjs_number text;
begin
  if p_request_id is null then raise exception 'INVALID_CHECKOUT_REQUEST_ID'; end if;
  v_fingerprint := jsonb_build_object(
    'employee_id', p_employee_id,
    'payment_method', p_payment_method,
    'items', coalesce(p_items, '[]'::jsonb),
    'cash_received', p_cash_received,
    'prescription', p_prescription,
    'supplementary_items', p_supplementary_items
  );
  if p_payment_method::text = 'tempo' or p_customer_id is not null or p_due_date is not null then
    v_fingerprint := v_fingerprint || jsonb_build_object(
      'customer_id', p_customer_id,
      'due_date', p_due_date
    );
  end if;

  insert into public.checkout_requests(request_id, employee_id, fingerprint)
  values(p_request_id, p_employee_id, v_fingerprint)
  on conflict (request_id) do nothing;

  select * into v_request from public.checkout_requests
  where request_id = p_request_id for update;
  if not found then raise exception 'CHECKOUT_REQUEST_NOT_FOUND'; end if;
  if v_request.employee_id <> p_employee_id or v_request.fingerprint <> v_fingerprint then
    raise exception 'CHECKOUT_REQUEST_CONFLICT';
  end if;
  if v_request.result is not null then return v_request.result; end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    v_result := public.checkout_transaction_with_prescription(
      p_employee_id, p_payment_method, p_items, p_cash_received, p_prescription, p_customer_id, p_due_date
    );
    v_transaction_id := (v_result->>'transaction_id')::uuid;
  else
    -- Empty cart checkout is strictly restricted to BPJS with at least one supplementary item
    if p_payment_method::text <> 'bpjs' or p_supplementary_items is null or jsonb_typeof(p_supplementary_items) <> 'array' or jsonb_array_length(p_supplementary_items) = 0 then
      raise exception 'INVALID_CART';
    end if;

    select id, position, is_active into v_employee
    from public.employees where id = p_employee_id;
    if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
      raise exception 'INVALID_EMPLOYEE';
    end if;

    if p_prescription is null or jsonb_typeof(p_prescription) <> 'object' then
      raise exception 'PRESCRIPTION_METADATA_REQUIRED';
    end if;

    v_patient_name := nullif(btrim(p_prescription->>'patient_name'), '');
    v_bpjs_number := nullif(btrim(p_prescription->>'bpjs_number'), '');
    if v_patient_name is null then raise exception 'PATIENT_NAME_REQUIRED'; end if;
    if v_bpjs_number is null then raise exception 'BPJS_NUMBER_REQUIRED'; end if;

    v_business_date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
    v_transaction_id := gen_random_uuid();

    insert into public.invoice_sequences(business_date, last_number)
    values (v_business_date, 1)
    on conflict (business_date) do update set last_number = public.invoice_sequences.last_number + 1
    returning last_number into v_invoice_sequence;

    v_invoice_number := 'INV-' || to_char(v_business_date, 'YYYYMMDD') || '-' || lpad(v_invoice_sequence::text, 4, '0');

    insert into public.transactions(
      id, invoice_number, business_date, cashier_id,
      subtotal, tax_amount, total_amount, payment_method, cash_received, cash_change,
      payment_confirmed_at, payment_confirmed_by, status
    ) values (
      v_transaction_id, v_invoice_number, v_business_date, p_employee_id,
      0, 0, 0, p_payment_method,
      0, 0, clock_timestamp(), p_employee_id, 'completed'
    );

    insert into public.transaction_prescriptions(
      transaction_id, prescription_number, doctor_name, patient_name,
      prescription_category, bpjs_number, prescription_origin, prescription_date
    ) values (
      v_transaction_id,
      nullif(btrim(p_prescription->>'prescription_number'), ''),
      nullif(btrim(p_prescription->>'prescription_origin'), ''),
      v_patient_name,
      'bpjs',
      v_bpjs_number,
      nullif(btrim(p_prescription->>'prescription_origin'), ''),
      case when nullif(btrim(p_prescription->>'prescription_date'), '') is not null
        then (p_prescription->>'prescription_date')::date else null end
    );

    v_result := jsonb_build_object(
      'transaction_id', v_transaction_id,
      'invoice_number', v_invoice_number,
      'status', 'completed',
      'subtotal', 0,
      'tax_amount', 0,
      'total_amount', 0,
      'cash_change', 0
    );
  end if;

  if p_supplementary_items is not null and jsonb_array_length(p_supplementary_items) > 0 then
    if p_payment_method::text <> 'bpjs' then
      raise exception 'SUPPLEMENTARY_ITEMS_BPJS_ONLY';
    end if;

    v_delivery_date := (clock_timestamp() at time zone 'Asia/Jakarta')::date + 1;

    for v_item in select * from jsonb_array_elements(p_supplementary_items) loop
      v_idx := v_idx + 1;
      v_drug_name := btrim(coalesce(v_item->>'drug_name', ''));
      v_quantity := (v_item->>'quantity')::integer;
      v_unit_price := (v_item->>'unit_price')::numeric(15,2);
      v_req_key := coalesce(nullif(btrim(v_item->>'request_key'), ''), format('%s-supp-%s', p_request_id, v_idx));

      if v_drug_name = '' then raise exception 'SUSULAN_DRUG_NAME_REQUIRED'; end if;
      if v_quantity is null or v_quantity < 1 then raise exception 'SUSULAN_INVALID_QUANTITY'; end if;
      if v_unit_price is null or v_unit_price < 0 then raise exception 'SUSULAN_INVALID_UNIT_PRICE'; end if;

      insert into public.bpjs_susulan_items(
        transaction_id, drug_name, quantity, unit_price,
        delivery_date, created_by, request_key
      ) values (
        v_transaction_id, v_drug_name, v_quantity, v_unit_price,
        coalesce((v_item->>'delivery_date')::date, v_delivery_date),
        p_employee_id, v_req_key
      )
      on conflict (request_key) do nothing;

      v_extra_subtotal := v_extra_subtotal + (v_quantity * v_unit_price);
    end loop;

    update public.transactions
    set subtotal = subtotal + v_extra_subtotal,
        total_amount = total_amount + v_extra_subtotal
    where id = v_transaction_id;

    v_result := jsonb_set(
      jsonb_set(v_result, '{subtotal}', to_jsonb((v_result->>'subtotal')::numeric + v_extra_subtotal)),
      '{total_amount}', to_jsonb((v_result->>'total_amount')::numeric + v_extra_subtotal)
    );
  end if;

  update public.checkout_requests
  set transaction_id = v_transaction_id,
      result = v_result,
      completed_at = clock_timestamp()
  where request_id = p_request_id;

  return v_result;
end;
$$;

revoke all on function public.checkout_transaction_idempotent(uuid, uuid, public.payment_method, jsonb, numeric, jsonb, jsonb, uuid, date) from public, anon, authenticated;
grant execute on function public.checkout_transaction_idempotent(uuid, uuid, public.payment_method, jsonb, numeric, jsonb, jsonb, uuid, date) to service_role;

-- 8. Extend transaction_history_view cleanly (preserving exact prior column order & names)
drop view if exists public.transaction_history_view;

create view public.transaction_history_view as
select
  t.id,
  t.invoice_number,
  t.created_at,
  t.business_date,
  t.payment_method,
  t.status as financial_status,
  t.total_amount,
  t.cashier_id,
  e.full_name as cashier_name,
  case
    when t.status = 'voided' then 'voided'
    when t.status = 'pending_payment' then 'pending_payment'
    when t.payment_method = 'bpjs' and exists (
      select 1 from public.bpjs_susulan_items s
      where s.transaction_id = t.id and s.fulfillment_status = 'pending_fulfillment'
    ) then 'incomplete_fulfillment'
    else t.status::text
  end as status,
  c.name as customer_name,
  cr.due_date as receivable_due_date,
  cr.payment_status as receivable_payment_status,
  cr.outstanding_amount as receivable_outstanding_amount
from public.transactions t
left join public.employees e on e.id = t.cashier_id
left join public.customers c on c.id = t.customer_id
left join public.customer_receivables cr on cr.transaction_id = t.id;

revoke all on public.transaction_history_view from public, anon, authenticated;
grant select on public.transaction_history_view to service_role;

commit;

