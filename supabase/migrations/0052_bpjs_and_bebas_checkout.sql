begin;

alter type public.payment_method add value if not exists 'bpjs';

alter table public.transactions drop constraint chk_transaction_payment_shape;
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
);

alter table public.transaction_prescriptions
  drop constraint transaction_prescriptions_category_check,
  add constraint transaction_prescriptions_category_check
    check (prescription_category is null or prescription_category in ('umum', 'bpjs', 'bebas'));

create or replace function public.checkout_transaction_with_prescription(
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
  if v_category not in ('umum', 'bpjs', 'bebas') then raise exception 'INVALID_PRESCRIPTION_CATEGORY'; end if;
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

  -- The established checkout remains the sole owner of pricing, stock locks,
  -- FEFO allocation, invoice generation and transaction-item creation.
  v_effective_method := case when v_category = 'bpjs' then 'qris'::public.payment_method else p_payment_method end;
  v_result := public.checkout_transaction(
    p_employee_id, v_effective_method, p_items,
    case when v_category = 'bpjs' then null else p_cash_received end,
    jsonb_build_object('prescription_number', v_prescription_number,
      'doctor_name', case when v_category = 'bebas' then '__BEBAS__' else v_prescription_origin end,
      'patient_name', case when v_category = 'bebas' then '__BEBAS__' else v_patient_name end)
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

revoke all on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb) to service_role;

commit;
