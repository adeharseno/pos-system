/* eslint-disable @typescript-eslint/no-require-imports */
const XLSX = require("xlsx");
const fs = require("fs");
const readline = require("readline");

const clean = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

async function parseBackupData() {
  const fileStream = fs.createReadStream('/Users/alana/Documents/pharmacy-pos-backups/2026-11-09/data.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let mode = null;
  const prods = [];
  const units = [];

  for await (const line of rl) {
    if (line.startsWith('COPY "public"."products"')) {
      mode = 'products';
      continue;
    } else if (line.startsWith('COPY "public"."product_units"')) {
      mode = 'units';
      continue;
    } else if (line === '\\.' || line === '\\\\.') {
      mode = null;
      continue;
    }

    if (mode === 'products') {
      const parts = line.split('\t');
      prods.push({
        id: parts[0],
        sku: parts[1],
        name: parts[2],
        base_unit: parts[10] === '\\N' ? null : parts[10],
        cost_price: parts[11] === '\\N' ? null : Number(parts[11]),
        unit_confirmed: parts[20] === 't'
      });
    } else if (mode === 'units') {
      const parts = line.split('\t');
      units.push({
        id: parts[0],
        product_id: parts[1],
        unit_name: parts[2] === '\\N' ? '' : parts[2],
        conversion_to_base: Number(parts[3]),
        selling_price: parts[4] === '\\N' ? null : Number(parts[4]),
        is_base_unit: parts[6] === 't'
      });
    }
  }
  return { prods, units };
}

async function run() {
  const { prods, units } = await parseBackupData();

  const dbByName = new Map();
  for (const p of prods) {
    const pUnits = units.filter(u => u.product_id === p.id);
    dbByName.set(clean(p.name), { product: p, units: pUnits });
  }

  const wb = XLSX.readFile("data/Supabase Snippet Untitled query.xlsx");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: ""});
  const data = rows.slice(1);

  const UNIT_CANONICAL_MAP = {
    "TAB": "TAB", "BTL": "BTL", "PCS": "PCS", "TUBE": "TUBE", "AMP": "AMP",
    "SYR": "SYR", "SCT": "SCT", "LBR": "LBR", "CAP": "CAP", "SPRAY": "SPRAY",
    "BOX": "BOX", "BKS": "BKS", "PEN": "PEN", "SUPP": "SUPP", "STRIP": "STRIP",
    "DUS": "DUS", "POT": "POT",
    "STP": "STRIP", "BLT": "BTL", "INF": "BTL", "RAH": "TAB", "LET": "TAB"
  };

  const processedProducts = new Set();
  const updateList = [];
  const reviewList = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const excelRow = i + 2;
    const excelNo = r[0];
    const excelName = String(r[1]).trim();
    const cleanName = clean(excelName);
    const rawPrice = r[2];
    const rawUnit = String(r[3]).trim().toUpperCase();

    const isNullPrice = rawPrice === null || String(rawPrice).trim().toLowerCase() === "null" || String(rawPrice).trim() === "";
    const excelPriceNum = isNullPrice ? null : Number(rawPrice);

    const entry = dbByName.get(cleanName);
    if (!entry) continue;

    const { product, units: pUnits } = entry;
    const baseUnit = pUnits.find(u => u.is_base_unit) || pUnits[0];
    const currentUnit = baseUnit ? baseUnit.unit_name : "";
    const currentPrice = baseUnit ? Number(baseUnit.selling_price) : null;
    const proposedUnit = UNIT_CANONICAL_MAP[rawUnit] || rawUnit;

    if (processedProducts.has(cleanName)) {
      if (cleanName === "AK MICROPORE 1 INCH" && excelPriceNum === 25000) {
        updateList.push({
          excelRow, excelNo, excelName, sku: product.sku,
          productId: product.id, unitId: baseUnit ? baseUnit.id : null,
          oldUnit: currentUnit, newUnit: "PCS",
          oldBaseUnit: product.base_unit,
          oldUnitConfirmed: product.unit_confirmed,
          oldPrice: currentPrice, newPrice: 25000.00,
          notes: "Canonical AK MICROPORE 1 INCH"
        });
      }
      continue;
    }
    processedProducts.add(cleanName);

    if (cleanName === "AK MICROPORE 1 INCH" && excelPriceNum === 29000) {
      continue; // Skip the 29.000 row
    }

    if (isNullPrice || ["RAH", "LET", "STP", "BLT", "INF"].includes(rawUnit)) {
      reviewList.push({ excelRow, excelName, sku: product.sku, rawPrice, rawUnit });
      continue; // Do NOT update REVIEW items
    }

    if (!currentUnit || currentUnit.toUpperCase() !== proposedUnit.toUpperCase() || (currentPrice !== null && Math.abs(currentPrice - excelPriceNum) > 0.01)) {
      updateList.push({
        excelRow, excelNo, excelName, sku: product.sku,
        productId: product.id, unitId: baseUnit ? baseUnit.id : null,
        oldUnit: currentUnit, newUnit: proposedUnit,
        oldBaseUnit: product.base_unit,
        oldUnitConfirmed: product.unit_confirmed,
        oldPrice: currentPrice, newPrice: currentPrice,
        notes: !currentUnit ? "Enrich empty unit" : "Refine unit"
      });
    }
  }

  console.log("Total UPDATE rows generated:", updateList.length);
  console.log("Total REVIEW rows skipped:", reviewList.length);

  // Generate Forward SQL with Persistent Snapshot & Execution Tracking
  let sqlForward = "-- ==============================================================================\n";
  sqlForward += "-- SYNCHRONIZATION OF " + updateList.length + " MASTER PRODUCT UNITS (PERSISTENT SNAPSHOT)\n";
  sqlForward += "-- Target: Controlled One-Time Execution from Excel Reference\n";
  sqlForward += "-- Batch ID: 'BATCH-20261110-EXCEL-SYNC'\n";
  sqlForward += "-- ZERO lines deleted, ZERO foreign keys modified, ZERO batch/stock changes\n";
  sqlForward += "-- ==============================================================================\n\n";
  sqlForward += "BEGIN;\n\n";

  sqlForward += "-- 1. Ensure persistent history and snapshot tables exist\n";
  sqlForward += "CREATE TABLE IF NOT EXISTS public._sync_history (\n";
  sqlForward += "  batch_id TEXT PRIMARY KEY,\n";
  sqlForward += "  description TEXT NOT NULL,\n";
  sqlForward += "  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),\n";
  sqlForward += "  completed_at TIMESTAMPTZ,\n";
  sqlForward += "  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'rolled_back', 'failed')),\n";
  sqlForward += "  expected_row_count INTEGER NOT NULL,\n";
  sqlForward += "  actual_row_count INTEGER\n";
  sqlForward += ");\n\n";

  sqlForward += "CREATE TABLE IF NOT EXISTS public._sync_product_unit_snapshots (\n";
  sqlForward += "  id BIGSERIAL PRIMARY KEY,\n";
  sqlForward += "  batch_id TEXT NOT NULL REFERENCES public._sync_history(batch_id) ON DELETE CASCADE,\n";
  sqlForward += "  product_id UUID NOT NULL,\n";
  sqlForward += "  product_unit_id UUID NOT NULL,\n";
  sqlForward += "  old_unit_name TEXT,\n";
  sqlForward += "  old_base_unit TEXT,\n";
  sqlForward += "  old_unit_confirmed BOOLEAN,\n";
  sqlForward += "  old_selling_price NUMERIC(14,2),\n";
  sqlForward += "  old_is_active BOOLEAN,\n";
  sqlForward += "  applied_unit_name TEXT NOT NULL,\n";
  sqlForward += "  applied_selling_price NUMERIC(14,2),\n";
  sqlForward += "  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()\n";
  sqlForward += ");\n\n";

  sqlForward += "CREATE INDEX IF NOT EXISTS idx_sync_snapshots_batch_prod\n";
  sqlForward += "ON public._sync_product_unit_snapshots(batch_id, product_id);\n\n";

  sqlForward += "-- 2. Precondition Assertions\n";
  sqlForward += "DO $$\n";
  sqlForward += "BEGIN\n";
  sqlForward += "  IF NOT EXISTS (\n";
  sqlForward += "    SELECT 1 FROM information_schema.columns\n";
  sqlForward += "    WHERE table_schema = 'public' AND table_name = 'product_units' AND column_name = 'is_active'\n";
  sqlForward += "  ) THEN\n";
  sqlForward += "    RAISE EXCEPTION 'PRECONDITION FAILED: Migration 0064 (is_active) must be applied before data sync.';\n";
  sqlForward += "  END IF;\n\n";
  sqlForward += "  IF EXISTS (\n";
  sqlForward += "    SELECT 1 FROM public._sync_history\n";
  sqlForward += "    WHERE batch_id = 'BATCH-20261110-EXCEL-SYNC' AND status = 'completed'\n";
  sqlForward += "  ) THEN\n";
  sqlForward += "    RAISE EXCEPTION 'PRECONDITION FAILED: Batch BATCH-20261110-EXCEL-SYNC has already completed.';\n";
  sqlForward += "  END IF;\n";
  sqlForward += "END $$;\n\n";

  sqlForward += "-- 3. Register batch execution\n";
  sqlForward += "INSERT INTO public._sync_history (batch_id, description, status, expected_row_count)\n";
  sqlForward += "VALUES ('BATCH-20261110-EXCEL-SYNC', 'Synchronize " + updateList.length + " product units from Excel canonical master', 'running', " + updateList.length + ")\n";
  sqlForward += "ON CONFLICT (batch_id) DO UPDATE SET status = 'running', started_at = clock_timestamp(), completed_at = NULL;\n\n";

  sqlForward += "-- 4. Temporary staging table for incoming values\n";
  sqlForward += "CREATE TEMP TABLE stage_product_sync (\n";
  sqlForward += "  product_id UUID PRIMARY KEY,\n";
  sqlForward += "  product_unit_id UUID,\n";
  sqlForward += "  new_unit_name TEXT NOT NULL,\n";
  sqlForward += "  new_selling_price NUMERIC(14,2)\n";
  sqlForward += ") ON COMMIT DROP;\n\n";

  sqlForward += "INSERT INTO stage_product_sync (product_id, product_unit_id, new_unit_name, new_selling_price) VALUES\n";
  const forwardValues = updateList.map((item, idx) => {
    const comma = idx === updateList.length - 1 ? ";" : ",";
    const uId = item.unitId ? `'${item.unitId}'` : "NULL";
    const priceStr = item.newPrice !== null ? item.newPrice.toFixed(2) : "NULL";
    const safeUnit = item.newUnit.replace(/'/g, "''");
    return `  ('${item.productId}', ${uId}, '${safeUnit}', ${priceStr})${comma} -- Row ${item.excelRow}: ${item.sku} ${item.excelName.replace(/'/g, "''")}`;
  });
  sqlForward += forwardValues.join("\n") + "\n\n";

  sqlForward += "-- 5. Capture persistent pre-sync snapshot into public._sync_product_unit_snapshots\n";
  sqlForward += "DELETE FROM public._sync_product_unit_snapshots WHERE batch_id = 'BATCH-20261110-EXCEL-SYNC';\n\n";
  sqlForward += "INSERT INTO public._sync_product_unit_snapshots (\n";
  sqlForward += "  batch_id, product_id, product_unit_id,\n";
  sqlForward += "  old_unit_name, old_base_unit, old_unit_confirmed,\n";
  sqlForward += "  old_selling_price, old_is_active,\n";
  sqlForward += "  applied_unit_name, applied_selling_price, created_at\n";
  sqlForward += ")\n";
  sqlForward += "SELECT\n";
  sqlForward += "  'BATCH-20261110-EXCEL-SYNC',\n";
  sqlForward += "  s.product_id,\n";
  sqlForward += "  s.product_unit_id,\n";
  sqlForward += "  pu.unit_name,\n";
  sqlForward += "  p.base_unit,\n";
  sqlForward += "  p.unit_confirmed,\n";
  sqlForward += "  pu.selling_price,\n";
  sqlForward += "  pu.is_active,\n";
  sqlForward += "  s.new_unit_name,\n";
  sqlForward += "  coalesce(s.new_selling_price, pu.selling_price),\n";
  sqlForward += "  clock_timestamp()\n";
  sqlForward += "FROM stage_product_sync s\n";
  sqlForward += "JOIN public.product_units pu ON pu.id = s.product_unit_id\n";
  sqlForward += "JOIN public.products p ON p.id = s.product_id;\n\n";

  sqlForward += "-- 6. Apply updates with assertions\n";
  sqlForward += "DO $$\n";
  sqlForward += "DECLARE\n";
  sqlForward += "  v_stage_count integer;\n";
  sqlForward += "  v_snapshot_count integer;\n";
  sqlForward += "  v_unit_updated integer;\n";
  sqlForward += "  v_prod_updated integer;\n";
  sqlForward += "BEGIN\n";
  sqlForward += "  SELECT count(*) INTO v_stage_count FROM stage_product_sync;\n";
  sqlForward += "  IF v_stage_count <> " + updateList.length + " THEN\n";
  sqlForward += "    RAISE EXCEPTION 'ASSERTION FAILED: Expected " + updateList.length + " items in stage_product_sync, got %', v_stage_count;\n";
  sqlForward += "  END IF;\n\n";
  sqlForward += "  SELECT count(*) INTO v_snapshot_count\n";
  sqlForward += "  FROM public._sync_product_unit_snapshots\n";
  sqlForward += "  WHERE batch_id = 'BATCH-20261110-EXCEL-SYNC';\n\n";
  sqlForward += "  IF v_snapshot_count <> " + updateList.length + " THEN\n";
  sqlForward += "    RAISE EXCEPTION 'ASSERTION FAILED: Expected " + updateList.length + " snapshots captured, got %', v_snapshot_count;\n";
  sqlForward += "  END IF;\n\n";
  sqlForward += "  -- Update product_units without changing IDs or FK references\n";
  sqlForward += "  UPDATE public.product_units pu\n";
  sqlForward += "  SET unit_name = s.new_unit_name,\n";
  sqlForward += "      selling_price = coalesce(s.new_selling_price, pu.selling_price),\n";
  sqlForward += "      is_base_unit = true,\n";
  sqlForward += "      updated_at = now()\n";
  sqlForward += "  FROM stage_product_sync s\n";
  sqlForward += "  WHERE pu.id = s.product_unit_id;\n";
  sqlForward += "  GET DIAGNOSTICS v_unit_updated = ROW_COUNT;\n";
  sqlForward += "  IF v_unit_updated <> " + updateList.length + " THEN\n";
  sqlForward += "    RAISE EXCEPTION 'ASSERTION FAILED: Expected " + updateList.length + " product_units updated, got %', v_unit_updated;\n";
  sqlForward += "  END IF;\n\n";
  sqlForward += "  -- Update products table base_unit and unit_confirmed\n";
  sqlForward += "  UPDATE public.products p\n";
  sqlForward += "  SET base_unit = s.new_unit_name,\n";
  sqlForward += "      unit_confirmed = true,\n";
  sqlForward += "      updated_at = now()\n";
  sqlForward += "  FROM stage_product_sync s\n";
  sqlForward += "  WHERE p.id = s.product_id;\n";
  sqlForward += "  GET DIAGNOSTICS v_prod_updated = ROW_COUNT;\n";
  sqlForward += "  IF v_prod_updated <> " + updateList.length + " THEN\n";
  sqlForward += "    RAISE EXCEPTION 'ASSERTION FAILED: Expected " + updateList.length + " products updated, got %', v_prod_updated;\n";
  sqlForward += "  END IF;\n";
  sqlForward += "END $$;\n\n";

  sqlForward += "-- 7. Mark batch completed in tracking table\n";
  sqlForward += "UPDATE public._sync_history\n";
  sqlForward += "SET status = 'completed',\n";
  sqlForward += "    completed_at = clock_timestamp(),\n";
  sqlForward += "    actual_row_count = " + updateList.length + "\n";
  sqlForward += "WHERE batch_id = 'BATCH-20261110-EXCEL-SYNC';\n\n";

  sqlForward += "COMMIT;\n";

  fs.writeFileSync("scripts/data-sync/sync_1923_products_from_excel.sql", sqlForward);

  // Generate Rollback SQL using Persistent Snapshot
  let sqlRollback = "-- ==============================================================================\n";
  sqlRollback += "-- ROLLBACK OF " + updateList.length + " MASTER PRODUCT UNITS VIA PERSISTENT SNAPSHOT\n";
  sqlRollback += "-- Batch ID: 'BATCH-20261110-EXCEL-SYNC'\n";
  sqlRollback += "-- Restores exact original unit_name, base_unit, unit_confirmed, and selling_price\n";
  sqlRollback += "-- Protects legitimate post-deployment modifications\n";
  sqlRollback += "-- ==============================================================================\n\n";
  sqlRollback += "BEGIN;\n\n";

  sqlRollback += "DO $$\n";
  sqlRollback += "DECLARE\n";
  sqlRollback += "  v_batch_id TEXT := 'BATCH-20261110-EXCEL-SYNC';\n";
  sqlRollback += "  v_batch_status TEXT;\n";
  sqlRollback += "  v_snapshot_count INTEGER;\n";
  sqlRollback += "  v_modified_since_sync INTEGER;\n";
  sqlRollback += "  v_unit_restored INTEGER;\n";
  sqlRollback += "  v_prod_restored INTEGER;\n";
  sqlRollback += "BEGIN\n";
  sqlRollback += "  -- 1. Precondition: Batch must exist and have completed\n";
  sqlRollback += "  SELECT status INTO v_batch_status\n";
  sqlRollback += "  FROM public._sync_history\n";
  sqlRollback += "  WHERE batch_id = v_batch_id;\n\n";
  sqlRollback += "  IF v_batch_status IS NULL THEN\n";
  sqlRollback += "    RAISE EXCEPTION 'PRECONDITION FAILED: Batch % not found in _sync_history', v_batch_id;\n";
  sqlRollback += "  END IF;\n\n";
  sqlRollback += "  IF v_batch_status <> 'completed' THEN\n";
  sqlRollback += "    RAISE EXCEPTION 'PRECONDITION FAILED: Batch % status is %, expected \"completed\"', v_batch_id, v_batch_status;\n";
  sqlRollback += "  END IF;\n\n";
  sqlRollback += "  -- 2. Verify snapshot count\n";
  sqlRollback += "  SELECT count(*) INTO v_snapshot_count\n";
  sqlRollback += "  FROM public._sync_product_unit_snapshots\n";
  sqlRollback += "  WHERE batch_id = v_batch_id;\n\n";
  sqlRollback += "  IF v_snapshot_count <> " + updateList.length + " THEN\n";
  sqlRollback += "    RAISE EXCEPTION 'PRECONDITION FAILED: Expected " + updateList.length + " snapshots for batch %, found %', v_batch_id, v_snapshot_count;\n";
  sqlRollback += "  END IF;\n\n";
  sqlRollback += "  -- 3. Check for subsequent legitimate user modifications after deployment\n";
  sqlRollback += "  SELECT count(*) INTO v_modified_since_sync\n";
  sqlRollback += "  FROM public._sync_product_unit_snapshots snap\n";
  sqlRollback += "  JOIN public.product_units pu ON pu.id = snap.product_unit_id\n";
  sqlRollback += "  JOIN public.products p ON p.id = snap.product_id\n";
  sqlRollback += "  WHERE snap.batch_id = v_batch_id\n";
  sqlRollback += "    AND (pu.unit_name IS DISTINCT FROM snap.applied_unit_name\n";
  sqlRollback += "         OR pu.selling_price IS DISTINCT FROM snap.applied_selling_price\n";
  sqlRollback += "         OR p.base_unit IS DISTINCT FROM snap.applied_unit_name);\n\n";
  sqlRollback += "  RAISE NOTICE 'Batch % rollback analysis: % total rows, % rows modified post-sync.',\n";
  sqlRollback += "    v_batch_id, v_snapshot_count, v_modified_since_sync;\n\n";
  sqlRollback += "  -- 4. Restore product_units (only restoring rows that still hold applied values, preserving legitimate post-deployment edits)\n";
  sqlRollback += "  UPDATE public.product_units pu\n";
  sqlRollback += "  SET unit_name = snap.old_unit_name,\n";
  sqlRollback += "      selling_price = coalesce(snap.old_selling_price, pu.selling_price),\n";
  sqlRollback += "      is_active = coalesce(snap.old_is_active, pu.is_active),\n";
  sqlRollback += "      updated_at = now()\n";
  sqlRollback += "  FROM public._sync_product_unit_snapshots snap\n";
  sqlRollback += "  WHERE snap.batch_id = v_batch_id\n";
  sqlRollback += "    AND pu.id = snap.product_unit_id\n";
  sqlRollback += "    AND pu.unit_name = snap.applied_unit_name\n";
  sqlRollback += "    AND pu.selling_price = snap.applied_selling_price;\n";
  sqlRollback += "  GET DIAGNOSTICS v_unit_restored = ROW_COUNT;\n\n";
  sqlRollback += "  -- 5. Restore products table\n";
  sqlRollback += "  UPDATE public.products p\n";
  sqlRollback += "  SET base_unit = snap.old_base_unit,\n";
  sqlRollback += "      unit_confirmed = snap.old_unit_confirmed,\n";
  sqlRollback += "      updated_at = now()\n";
  sqlRollback += "  FROM public._sync_product_unit_snapshots snap\n";
  sqlRollback += "  WHERE snap.batch_id = v_batch_id\n";
  sqlRollback += "    AND p.id = snap.product_id\n";
  sqlRollback += "    AND p.base_unit = snap.applied_unit_name;\n";
  sqlRollback += "  GET DIAGNOSTICS v_prod_restored = ROW_COUNT;\n\n";
  sqlRollback += "  RAISE NOTICE 'Rollback executed: % product_units restored, % products restored.', v_unit_restored, v_prod_restored;\n\n";
  sqlRollback += "  -- 6. Update tracking history\n";
  sqlRollback += "  UPDATE public._sync_history\n";
  sqlRollback += "  SET status = 'rolled_back',\n";
  sqlRollback += "      completed_at = clock_timestamp()\n";
  sqlRollback += "  WHERE batch_id = v_batch_id;\n";
  sqlRollback += "END $$;\n\n";

  sqlRollback += "COMMIT;\n";

  fs.writeFileSync("scripts/data-sync/rollback_1923_products_from_excel.sql", sqlRollback);

  console.log("SUCCESS: Created scripts/data-sync/sync_1923_products_from_excel.sql (" + updateList.length + " rows)");
  console.log("SUCCESS: Created scripts/data-sync/rollback_1923_products_from_excel.sql via persistent snapshot");
}
run();

