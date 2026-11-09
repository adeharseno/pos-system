-- Migration 0060: Atomic BPJS supplementary (susulan) items checkout
-- Atomically inserts supplementary items and updates transaction subtotal & total_amount
-- within the checkout_transaction_idempotent RPC.

begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- Drop the 6-argument overload so the 7-argument version with default null covers both
drop function if exists public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb);

create or replace function public.checkout_transaction_idempotent(
  p_request_id uuid,
  p_employee_id uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_cash_received numeric default null,
  p_prescription jsonb default null,
  p_supplementary_items jsonb default null
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
begin
  if p_request_id is null then raise exception 'INVALID_CHECKOUT_REQUEST_ID'; end if;
  v_fingerprint := jsonb_build_object(
    'employee_id', p_employee_id,
    'payment_method', p_payment_method,
    'items', p_items,
    'cash_received', p_cash_received,
    'prescription', p_prescription,
    'supplementary_items', p_supplementary_items
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

  -- 1. Execute core checkout with prescription (handles cart items, stock deduction, prescription metadata)
  v_result := public.checkout_transaction_with_prescription(
    p_employee_id, p_payment_method, p_items, p_cash_received, p_prescription
  );
  v_transaction_id := (v_result->>'transaction_id')::uuid;

  -- 2. If supplementary items exist (BPJS), insert them atomically and update transaction totals
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

    -- Update transactions subtotal and total_amount atomically
    update public.transactions
    set subtotal = subtotal + v_extra_subtotal,
        total_amount = total_amount + v_extra_subtotal
    where id = v_transaction_id;

    -- Update return jsonb with combined totals
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

revoke all on function public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.checkout_transaction_idempotent(uuid,uuid,public.payment_method,jsonb,numeric,jsonb,jsonb) to service_role;

commit;

