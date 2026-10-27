/* eslint-disable @typescript-eslint/no-require-imports */
// Actual supplied workbook, existing local database and existing authenticated APIs.
// No master data, classifications, prices or stock are invented by this check.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const base = process.env.LOCAL_IMPORT_TEST_URL || 'http://localhost:3000';
  for (const target of [url, base]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(target).hostname), 'REFUSING_NON_LOCAL_TARGET');
  assert.ok(process.env.PRODUCT_IMPORT_FILE && process.env.LOCAL_IMPORT_TEST_EMAIL && process.env.LOCAL_IMPORT_TEST_PASSWORD, 'Set workbook path and existing local owner credentials');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const count = async table => {
    const result = await admin.from(table).select('id', { count: 'exact', head: true });
    assert.ifError(result.error); return result.count;
  };
  const before = { products: await count('products'), batches: await count('product_batches') };
  let cookies = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false }, cookies: { getAll: () => cookies, setAll: values => { cookies = values; } },
  });
  const login = await client.auth.signInWithPassword({ email: process.env.LOCAL_IMPORT_TEST_EMAIL, password: process.env.LOCAL_IMPORT_TEST_PASSWORD });
  assert.ifError(login.error);
  const cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
  try {
    const form = new FormData();
    form.set('file', new File([fs.readFileSync(process.env.PRODUCT_IMPORT_FILE)], 'master_produk.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const previewResponse = await fetch(`${base}/api/products/import/preview`, { method: 'POST', headers: { cookie }, body: form });
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200); assert.equal(preview.ok, true);
    const rows = preview.data.rows;
    assert.equal(rows.length, 3687); assert.ok(rows.every(row => row.isActive === false));
    assert.ok(rows.every(row => !('reference_url' in row) && !('openingStock' in row)));
    const unmapped = rows.filter(row => !row.categoryId || !row.subcategoryId).length;
    const unknownClassification = rows.filter(row => !['otc', 'otc_limited', 'prescription_required'].includes(row.drugClassification)).length;
    console.log(JSON.stringify({ preview: rows.length, valid: rows.filter(row => row.valid).length, unmapped, unknownClassification, mappedColumns: preview.data.info.mappedColumns.map(value => value.column), ignoredColumns: preview.data.info.ignoredColumns.map(value => value.column), ignoredSheets: preview.data.info.ignoredSheets }));

    const payload = row => ({ rowNumber: row.rowNumber, sku: row.sku, name: row.name, genericName: row.genericName, manufacturer: row.manufacturer, baseUnit: row.baseUnit, sellingPrice: row.sellingPrice, costPrice: row.costPrice || 0, barcode: row.barcode, drugClassification: row.drugClassification, minimumStock: row.minimumStock || 0, isActive: row.isActive, categoryId: row.categoryId, subcategoryId: row.subcategoryId, defaultSupplierId: row.defaultSupplierId, storageLocationId: row.storageLocationId });
    for (const [name, input] of [['first-50', rows.slice(0, 50)], ['all-3687', rows], ['repeat-same-file', rows]]) {
      const started = Date.now(), results = [];
      let maxBatchMs = 0;
      for (let offset = 0; offset < input.length; offset += 50) {
        const batchStarted = Date.now();
        const response = await fetch(`${base}/api/products/import/commit`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ rows: input.slice(offset, offset + 50).map(payload) }) });
        const body = await response.json();
        assert.equal(response.status, 200); assert.equal(body.ok, true);
        assert.equal(body.data.results.length, Math.min(50, input.length - offset));
        results.push(...body.data.results); maxBatchMs = Math.max(maxBatchMs, Date.now() - batchStarted);
      }
      const errors = {};
      for (const result of results) if (result.error) errors[result.error.code] = (errors[result.error.code] || 0) + 1;
      console.log(JSON.stringify({ test: name, rows: results.length, success: results.filter(row => row.status === 'success').length, failed: results.filter(row => row.status === 'failed').length, errors, durationMs: Date.now() - started, maxBatchMs }));
    }
    assert.equal(await count('product_batches'), before.batches, 'Import never creates opening stock');
    if (!rows.some(row => row.valid)) assert.equal(await count('products'), before.products, 'Invalid workbook rows are not inserted');
    const unauthenticated = await fetch(`${base}/api/products/import/commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [payload(rows[0])] }) });
    assert.equal(unauthenticated.status, 401);
    console.log('PASS: local-only actual-workbook checks; no fabricated master data or stock; unauthenticated commit denied');
  } finally { await client.auth.signOut({ scope: 'local' }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
