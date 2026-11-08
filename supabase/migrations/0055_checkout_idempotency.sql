begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create table if not exists public.checkout_requests (
  request_id uuid primary key,
  employee_id uuid not null references public.employees(id) on delete restrict,
  fingerprint jsonb not null,
  transaction_id uuid unique references public.transactions(id) on delete restrict,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint checkout_requests_completion_check check (
    (transaction_id is null and result is null and completed_at is null)
    or (transaction_id is not null and result is not null and completed_at is not null)
  )
);

alter table public.checkout_requests enable row level security;
revoke all on public.checkout_requests from public, anon, authenticated;
grant select, insert, update on public.checkout_requests to service_role;

create or replace function public.checkout_transaction_idempotent(
  p_request_id uuid,
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint jsonb;
  v_request public.checkout_requests%rowtype;
  v_result jsonb;
begin
  if p_request_id is null then raise exception 'INVALID_CHECKOUT_REQUEST_ID'; end if;
  v_fingerprint := jsonb_build_object(
    'employee_id', p_employee_id,
    'payment_method', p_payment_method,
    'items', p_items,
    'cash_received', p_cash_received,
    'prescription', p_prescription
  );

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

  v_result := public.checkout_transaction_with_prescription(
    p_employee_id, p_payment_method, p_items, p_cash_received, p_prescription
  );
  update public.checkout_requests
  set transaction_id = (v_result->>'transaction_id')::uuid,
      result = v_result,
      completed_at = clock_timestamp()
  where request_id = p_request_id;
  return v_result;
end;
$$;

revoke all on function public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb) to service_role;

commit;
