begin;

-- Reuse the existing serialized manual-confirmation transition for both
-- non-cash methods. The row lock makes concurrent/repeated confirmation safe.
create or replace function public.confirm_qris_payment(
  p_transaction_id uuid,
  p_employee_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tx public.transactions%rowtype;
  v_employee public.employees%rowtype;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin', 'kasir') then
    raise exception 'INVALID_EMPLOYEE';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  if v_tx.payment_method not in ('qris', 'bank_transfer') then
    raise exception 'NOT_MANUAL_PAYMENT_TRANSACTION';
  end if;
  if v_tx.status = 'completed' or v_tx.payment_confirmed_at is not null then
    if v_tx.payment_method = 'qris' then
      raise exception 'QRIS_ALREADY_CONFIRMED';
    end if;
    raise exception 'BANK_TRANSFER_ALREADY_CONFIRMED';
  end if;
  if v_tx.status <> 'pending_payment' then raise exception 'INVALID_TRANSACTION_STATE'; end if;

  update public.transactions
  set status = 'completed',
      payment_confirmed_at = clock_timestamp(),
      payment_confirmed_by = p_employee_id
  where id = p_transaction_id;

  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'completed');
end;
$$;

revoke all on function public.confirm_qris_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_qris_payment(uuid, uuid) to service_role;

commit;
