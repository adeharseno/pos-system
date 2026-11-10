-- ==============================================================================
-- ROLLBACK OF 1923 MASTER PRODUCT UNITS VIA PERSISTENT SNAPSHOT
-- Batch ID: 'BATCH-20261110-EXCEL-SYNC'
-- Restores exact original unit_name, base_unit, unit_confirmed, and selling_price
-- Protects legitimate post-deployment modifications
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_batch_id TEXT := 'BATCH-20261110-EXCEL-SYNC';
  v_batch_status TEXT;
  v_snapshot_count INTEGER;
  v_modified_since_sync INTEGER;
  v_unit_restored INTEGER;
  v_prod_restored INTEGER;
BEGIN
  -- 1. Precondition: Batch must exist and have completed
  SELECT status INTO v_batch_status
  FROM public._sync_history
  WHERE batch_id = v_batch_id;

  IF v_batch_status IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Batch % not found in _sync_history', v_batch_id;
  END IF;

  IF v_batch_status <> 'completed' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Batch % status is %, expected "completed"', v_batch_id, v_batch_status;
  END IF;

  -- 2. Verify snapshot count
  SELECT count(*) INTO v_snapshot_count
  FROM public._sync_product_unit_snapshots
  WHERE batch_id = v_batch_id;

  IF v_snapshot_count <> 1923 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Expected 1923 snapshots for batch %, found %', v_batch_id, v_snapshot_count;
  END IF;

  -- 3. Check for subsequent legitimate user modifications after deployment
  SELECT count(*) INTO v_modified_since_sync
  FROM public._sync_product_unit_snapshots snap
  JOIN public.product_units pu ON pu.id = snap.product_unit_id
  JOIN public.products p ON p.id = snap.product_id
  WHERE snap.batch_id = v_batch_id
    AND (pu.unit_name IS DISTINCT FROM snap.applied_unit_name
         OR pu.selling_price IS DISTINCT FROM snap.applied_selling_price
         OR p.base_unit IS DISTINCT FROM snap.applied_unit_name);

  RAISE NOTICE 'Batch % rollback analysis: % total rows, % rows modified post-sync.',
    v_batch_id, v_snapshot_count, v_modified_since_sync;

  -- 4. Restore product_units (only restoring rows that still hold applied values, preserving legitimate post-deployment edits)
  UPDATE public.product_units pu
  SET unit_name = snap.old_unit_name,
      selling_price = coalesce(snap.old_selling_price, pu.selling_price),
      is_active = coalesce(snap.old_is_active, pu.is_active),
      updated_at = now()
  FROM public._sync_product_unit_snapshots snap
  WHERE snap.batch_id = v_batch_id
    AND pu.id = snap.product_unit_id
    AND pu.unit_name = snap.applied_unit_name
    AND pu.selling_price = snap.applied_selling_price;
  GET DIAGNOSTICS v_unit_restored = ROW_COUNT;

  -- 5. Restore products table
  UPDATE public.products p
  SET base_unit = snap.old_base_unit,
      unit_confirmed = snap.old_unit_confirmed,
      updated_at = now()
  FROM public._sync_product_unit_snapshots snap
  WHERE snap.batch_id = v_batch_id
    AND p.id = snap.product_id
    AND p.base_unit = snap.applied_unit_name;
  GET DIAGNOSTICS v_prod_restored = ROW_COUNT;

  RAISE NOTICE 'Rollback executed: % product_units restored, % products restored.', v_unit_restored, v_prod_restored;

  -- 6. Update tracking history
  UPDATE public._sync_history
  SET status = 'rolled_back',
      completed_at = clock_timestamp()
  WHERE batch_id = v_batch_id;
END $$;

COMMIT;
