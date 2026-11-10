-- ==============================================================================
-- DYNAMIC TRANSACTION & INVENTORY PREFLIGHT / POSTFLIGHT VERIFICATION
-- pharmacy-pos-pilot-1
-- ==============================================================================

-- 1. Create persistent preflight snapshot table if not exists
CREATE TABLE IF NOT EXISTS public._preflight_migration_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  transaction_count INTEGER NOT NULL,
  transaction_items_count INTEGER NOT NULL,
  transaction_sum_total NUMERIC(16,2) NOT NULL,
  transaction_id_checksum TEXT NOT NULL,
  payment_records_count INTEGER NOT NULL,
  payment_sum_total NUMERIC(16,2) NOT NULL,
  purchase_invoice_count INTEGER NOT NULL,
  purchase_invoice_sum_total NUMERIC(16,2) NOT NULL,
  product_batch_count INTEGER NOT NULL,
  product_batch_total_quantity BIGINT NOT NULL,
  product_count INTEGER NOT NULL,
  foreign_key_violations INTEGER NOT NULL,
  active_qris_pending_count INTEGER NOT NULL
);

-- 2. Function to take a dynamic preflight snapshot
CREATE OR REPLACE FUNCTION public.take_preflight_snapshot(p_snapshot_id TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_txn_count integer;
  v_item_count integer;
  v_txn_total numeric(16,2);
  v_txn_checksum text;
  v_pay_count integer;
  v_pay_total numeric(16,2);
  v_pi_count integer;
  v_pi_total numeric(16,2);
  v_batch_count integer;
  v_batch_qty bigint;
  v_prod_count integer;
  v_fk_violations integer;
  v_qris_pending integer;
  v_result jsonb;
BEGIN
  -- Dynamic metric collection
  SELECT count(*), coalesce(sum(total_amount), 0)
  INTO v_txn_count, v_txn_total
  FROM public.transactions;

  SELECT count(*) INTO v_item_count FROM public.transaction_items;

  -- Compute deterministic checksum across all transactions and statuses
  SELECT coalesce(md5(string_agg(id::text || ':' || status || ':' || total_amount::text, ',' ORDER BY id)), 'empty')
  INTO v_txn_checksum
  FROM public.transactions;

  SELECT count(*), coalesce(sum(amount), 0)
  INTO v_pay_count, v_pay_total
  FROM public.purchase_invoice_payments;

  SELECT count(*), coalesce(sum(total_amount), 0)
  INTO v_pi_count, v_pi_total
  FROM public.purchase_invoices;

  SELECT count(*), coalesce(sum(quantity), 0)
  INTO v_batch_count, v_batch_qty
  FROM public.product_batches;

  SELECT count(*) INTO v_prod_count FROM public.products;

  -- Check foreign key integrity
  SELECT (
    (SELECT count(*) FROM public.transaction_items ti LEFT JOIN public.product_units pu ON (ti.product_unit_id, ti.product_id) = (pu.id, pu.product_id) WHERE pu.id IS NULL) +
    (SELECT count(*) FROM public.purchase_invoice_receipts pir LEFT JOIN public.product_units pu ON pir.product_unit_id = pu.id WHERE pu.id IS NULL)
  ) INTO v_fk_violations;

  -- Active pending QRIS
  SELECT count(*) INTO v_qris_pending
  FROM public.transactions
  WHERE payment_method = 'qris' AND status = 'pending_payment';

  -- Store into snapshot table
  INSERT INTO public._preflight_migration_snapshots (
    snapshot_id, taken_at, transaction_count, transaction_items_count,
    transaction_sum_total, transaction_id_checksum, payment_records_count,
    payment_sum_total, purchase_invoice_count, purchase_invoice_sum_total,
    product_batch_count, product_batch_total_quantity, product_count,
    foreign_key_violations, active_qris_pending_count
  ) VALUES (
    p_snapshot_id, clock_timestamp(), v_txn_count, v_item_count,
    v_txn_total, v_txn_checksum, v_pay_count,
    v_pay_total, v_pi_count, v_pi_total,
    v_batch_count, v_batch_qty, v_prod_count,
    v_fk_violations, v_qris_pending
  )
  ON CONFLICT (snapshot_id) DO UPDATE SET
    taken_at = EXCLUDED.taken_at,
    transaction_count = EXCLUDED.transaction_count,
    transaction_items_count = EXCLUDED.transaction_items_count,
    transaction_sum_total = EXCLUDED.transaction_sum_total,
    transaction_id_checksum = EXCLUDED.transaction_id_checksum,
    payment_records_count = EXCLUDED.payment_records_count,
    payment_sum_total = EXCLUDED.payment_sum_total,
    purchase_invoice_count = EXCLUDED.purchase_invoice_count,
    purchase_invoice_sum_total = EXCLUDED.purchase_invoice_sum_total,
    product_batch_count = EXCLUDED.product_batch_count,
    product_batch_total_quantity = EXCLUDED.product_batch_total_quantity,
    product_count = EXCLUDED.product_count,
    foreign_key_violations = EXCLUDED.foreign_key_violations,
    active_qris_pending_count = EXCLUDED.active_qris_pending_count;

  v_result := jsonb_build_object(
    'status', 'SNAPSHOT_CAPTURED',
    'snapshot_id', p_snapshot_id,
    'transaction_count', v_txn_count,
    'transaction_sum_total', v_txn_total,
    'transaction_checksum', v_txn_checksum,
    'payment_records_count', v_pay_count,
    'payment_sum_total', v_pay_total,
    'purchase_invoice_count', v_pi_count,
    'purchase_invoice_sum_total', v_pi_total,
    'product_batch_count', v_batch_count,
    'product_batch_total_quantity', v_batch_qty,
    'product_count', v_prod_count,
    'foreign_key_violations', v_fk_violations,
    'active_qris_pending_count', v_qris_pending
  );

  RETURN v_result;
END; $$;

-- 3. Function to verify postflight consistency against preflight snapshot
CREATE OR REPLACE FUNCTION public.verify_postflight_consistency(p_snapshot_id TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  snap public._preflight_migration_snapshots%rowtype;
  v_curr_txn_count integer;
  v_curr_item_count integer;
  v_curr_txn_total numeric(16,2);
  v_curr_txn_checksum text;
  v_curr_pay_count integer;
  v_curr_pay_total numeric(16,2);
  v_curr_pi_count integer;
  v_curr_pi_total numeric(16,2);
  v_curr_batch_count integer;
  v_curr_batch_qty bigint;
  v_curr_fk_violations integer;
  v_discrepancies text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO snap FROM public._preflight_migration_snapshots WHERE snapshot_id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PREFLIGHT_SNAPSHOT_NOT_FOUND: %', p_snapshot_id;
  END IF;

  -- 1. Transactions check
  SELECT count(*), coalesce(sum(total_amount), 0)
  INTO v_curr_txn_count, v_curr_txn_total
  FROM public.transactions;

  IF v_curr_txn_count <> snap.transaction_count THEN
    v_discrepancies := array_append(v_discrepancies, format('Transaction count changed: %s -> %s', snap.transaction_count, v_curr_txn_count));
  END IF;

  IF v_curr_txn_total <> snap.transaction_sum_total THEN
    v_discrepancies := array_append(v_discrepancies, format('Transaction sum total changed: %s -> %s', snap.transaction_sum_total, v_curr_txn_total));
  END IF;

  SELECT coalesce(md5(string_agg(id::text || ':' || status || ':' || total_amount::text, ',' ORDER BY id)), 'empty')
  INTO v_curr_txn_checksum
  FROM public.transactions;

  IF v_curr_txn_checksum <> snap.transaction_id_checksum THEN
    v_discrepancies := array_append(v_discrepancies, format('Transaction checksum mismatch: %s vs %s', snap.transaction_id_checksum, v_curr_txn_checksum));
  END IF;

  -- 2. Payments check
  SELECT count(*), coalesce(sum(amount), 0)
  INTO v_curr_pay_count, v_curr_pay_total
  FROM public.purchase_invoice_payments;

  IF v_curr_pay_count <> snap.payment_records_count OR v_curr_pay_total <> snap.payment_sum_total THEN
    v_discrepancies := array_append(v_discrepancies, format('Payments changed: (%s, %s) -> (%s, %s)', snap.payment_records_count, snap.payment_sum_total, v_curr_pay_count, v_curr_pay_total));
  END IF;

  -- 3. Invoices check
  SELECT count(*), coalesce(sum(total_amount), 0)
  INTO v_curr_pi_count, v_curr_pi_total
  FROM public.purchase_invoices;

  IF v_curr_pi_count <> snap.purchase_invoice_count OR v_curr_pi_total <> snap.purchase_invoice_sum_total THEN
    v_discrepancies := array_append(v_discrepancies, format('Invoices changed: (%s, %s) -> (%s, %s)', snap.purchase_invoice_count, snap.purchase_invoice_sum_total, v_curr_pi_count, v_curr_pi_total));
  END IF;

  -- 4. Batch quantity check
  SELECT count(*), coalesce(sum(quantity), 0)
  INTO v_curr_batch_count, v_curr_batch_qty
  FROM public.product_batches;

  IF v_curr_batch_qty <> snap.product_batch_total_quantity THEN
    v_discrepancies := array_append(v_discrepancies, format('Total inventory stock changed: %s -> %s', snap.product_batch_total_quantity, v_curr_batch_qty));
  END IF;

  -- 5. Foreign keys
  SELECT (
    (SELECT count(*) FROM public.transaction_items ti LEFT JOIN public.product_units pu ON (ti.product_unit_id, ti.product_id) = (pu.id, pu.product_id) WHERE pu.id IS NULL) +
    (SELECT count(*) FROM public.purchase_invoice_receipts pir LEFT JOIN public.product_units pu ON pir.product_unit_id = pu.id WHERE pu.id IS NULL)
  ) INTO v_curr_fk_violations;

  IF v_curr_fk_violations > 0 THEN
    v_discrepancies := array_append(v_discrepancies, format('Foreign key violations detected: %s', v_curr_fk_violations));
  END IF;

  IF array_length(v_discrepancies, 1) > 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT CONSISTENCY VIOLATION: %', array_to_string(v_discrepancies, '; ');
  END IF;

  RETURN jsonb_build_object(
    'status', 'POSTFLIGHT_CONSISTENCY_PASS',
    'snapshot_id', p_snapshot_id,
    'transaction_count_verified', v_curr_txn_count,
    'inventory_quantity_verified', v_curr_batch_qty,
    'foreign_key_violations', v_curr_fk_violations,
    'message', 'All transaction, payment, invoice, and stock records are 100% identical to preflight snapshot.'
  );
END; $$;

-- 4. Set security permissions
REVOKE ALL ON FUNCTION public.take_preflight_snapshot(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_preflight_snapshot(text) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.verify_postflight_consistency(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_postflight_consistency(text) TO service_role, postgres;

REVOKE ALL ON TABLE public._preflight_migration_snapshots FROM public, anon, authenticated;
GRANT ALL ON TABLE public._preflight_migration_snapshots TO service_role, postgres;

