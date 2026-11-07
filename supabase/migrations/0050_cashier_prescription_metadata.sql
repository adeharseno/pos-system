begin;

alter table public.transaction_prescriptions
  alter column doctor_name drop not null,
  alter column patient_name drop not null,
  add column prescription_category text,
  add column bpjs_number text,
  add column prescription_origin text,
  add column prescription_date date,
  add constraint transaction_prescriptions_category_check
    check (prescription_category is null or prescription_category in ('umum', 'bpjs')),
  add constraint transaction_prescriptions_bpjs_check
    check (prescription_category = 'bpjs' or bpjs_number is null);

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
begin
  if p_prescription is null or jsonb_typeof(p_prescription) <> 'object' then
    raise exception 'PRESCRIPTION_METADATA_REQUIRED';
  end if;
  v_category := lower(btrim(coalesce(p_prescription->>'prescription_category', '')));
  if v_category not in ('umum', 'bpjs') then raise exception 'INVALID_PRESCRIPTION_CATEGORY'; end if;

  v_patient_name := nullif(btrim(p_prescription->>'patient_name'), '');
  v_bpjs_number := nullif(btrim(p_prescription->>'bpjs_number'), '');
  v_prescription_number := nullif(btrim(p_prescription->>'prescription_number'), '');
  v_prescription_origin := nullif(btrim(p_prescription->>'prescription_origin'), '');
  if nullif(btrim(p_prescription->>'prescription_date'), '') is not null then
    v_prescription_date := (p_prescription->>'prescription_date')::date;
  end if;
  if v_category = 'bpjs' and v_bpjs_number is null then raise exception 'BPJS_NUMBER_REQUIRED'; end if;

  -- Stock, FEFO, payment, and locking remain owned by the existing checkout.
  -- The nested call and metadata write are committed or rolled back together.
  v_result := public.checkout_transaction(
    p_employee_id, p_payment_method, p_items, p_cash_received,
    jsonb_build_object('prescription_number', v_prescription_number,
      'doctor_name', v_prescription_origin, 'patient_name', v_patient_name)
  );
  v_transaction_id := (v_result->>'transaction_id')::uuid;

  update public.transaction_prescriptions
  set prescription_number = v_prescription_number,
      doctor_name = v_prescription_origin,
      patient_name = v_patient_name,
      prescription_category = v_category,
      bpjs_number = case when v_category = 'bpjs' then v_bpjs_number else null end,
      prescription_origin = v_prescription_origin,
      prescription_date = v_prescription_date
  where transaction_id = v_transaction_id;

  if not found then
    insert into public.transaction_prescriptions(
      transaction_id, prescription_number, doctor_name, patient_name,
      prescription_category, bpjs_number, prescription_origin, prescription_date
    ) values (
      v_transaction_id, v_prescription_number, v_prescription_origin, v_patient_name,
      v_category, case when v_category = 'bpjs' then v_bpjs_number else null end,
      v_prescription_origin, v_prescription_date
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.checkout_transaction_with_prescription(uuid, public.payment_method, jsonb, numeric, jsonb) to service_role;

commit;
