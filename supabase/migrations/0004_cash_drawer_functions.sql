-- M2.3: atomic cash-drawer lifecycle.

create or replace function public.open_cash_drawer(p_employee_id uuid,p_opening_balance numeric)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_employee public.employees%rowtype; v_session public.cash_drawer_sessions%rowtype;
begin
  if p_opening_balance is null or p_opening_balance<0 then raise exception 'INVALID_OPENING_BALANCE'; end if;
  select * into v_employee from public.employees where id=p_employee_id for update;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin','kasir') then raise exception 'INVALID_EMPLOYEE'; end if;
  if exists(select 1 from public.cash_drawer_sessions where employee_id=p_employee_id and closed_at is null) then raise exception 'CASH_DRAWER_ALREADY_OPEN'; end if;
  insert into public.cash_drawer_sessions(employee_id,opening_balance) values(p_employee_id,round(p_opening_balance,2)) returning * into v_session;
  return jsonb_build_object('session_id',v_session.id,'employee_id',v_session.employee_id,'opening_balance',v_session.opening_balance,'opened_at',v_session.opened_at,'is_open',true);
end; $$;

create or replace function public.close_cash_drawer(p_session_id uuid,p_employee_id uuid,p_actual_closing_cash numeric)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_session public.cash_drawer_sessions%rowtype; v_employee public.employees%rowtype;
  v_sales numeric(14,2); v_refunds numeric(14,2); v_expected numeric(14,2); v_actual numeric(14,2);
begin
  if p_actual_closing_cash is null or p_actual_closing_cash<0 then raise exception 'INVALID_CLOSING_BALANCE'; end if;
  select * into v_employee from public.employees where id=p_employee_id;
  if not found or not v_employee.is_active or v_employee.position not in ('owner_admin','kasir') then raise exception 'INVALID_EMPLOYEE'; end if;
  select * into v_session from public.cash_drawer_sessions where id=p_session_id for update;
  if not found then raise exception 'NO_ACTIVE_CASH_DRAWER'; end if;
  if v_session.employee_id<>p_employee_id then raise exception 'FORBIDDEN'; end if;
  if not v_session.is_open then raise exception 'CASH_DRAWER_ALREADY_CLOSED'; end if;
  select coalesce(sum(total_amount),0) into v_sales from public.transactions
    where cash_drawer_session_id=p_session_id and payment_method='cash' and status='completed';
  select coalesce(sum(refund_total),0) into v_refunds from public.returns
    where cash_drawer_session_id=p_session_id and source='customer' and refund_method='cash';
  v_expected:=round(v_session.opening_balance+v_sales-v_refunds,2); v_actual:=round(p_actual_closing_cash,2);
  update public.cash_drawer_sessions set closing_balance_expected=v_expected,closing_balance_actual=v_actual,
    variance=v_actual-v_expected,closed_at=clock_timestamp() where id=p_session_id;
  return jsonb_build_object('session_id',p_session_id,'opening_balance',v_session.opening_balance,'cash_sales',v_sales,
    'cash_refunds',v_refunds,'expected_cash',v_expected,'actual_cash',v_actual,'difference',v_actual-v_expected,'is_open',false);
end; $$;

revoke all on function public.open_cash_drawer(uuid,numeric) from public,anon,authenticated;
revoke all on function public.close_cash_drawer(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.open_cash_drawer(uuid,numeric) to service_role;
grant execute on function public.close_cash_drawer(uuid,uuid,numeric) to service_role;
