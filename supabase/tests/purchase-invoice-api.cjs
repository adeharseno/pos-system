/* eslint-disable @typescript-eslint/no-require-imports */
// Integration test restricted to local services. Own fixtures are removed in finally.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:3102';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
for (const url of [appUrl, supabaseUrl]) if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('REFUSING_NON_LOCAL_SERVICE');
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
const invoiceIds = [], supplierIds = [], authIds = [], employeeIds = [];
const categoryId = randomUUID(), subcategoryId = randomUUID(), pricedProduct = randomUUID(), unpricedProduct = randomUUID(), baseUnitId = randomUUID(), stripUnitId = randomUUID();
const snapshot = async () => (await db.query(`select
  (select md5(coalesce(string_agg(row_to_json(b)::text,',' order by id),'')) from product_batches b) batches,
  (select md5(coalesce(string_agg(row_to_json(p)::text,',' order by id),'')) from products p) products,
  (select md5(coalesce(string_agg(row_to_json(u)::text,',' order by id),'')) from product_units u) units`)).rows[0];
async function fixture(role) {
  const email = `${randomUUID()}@example.test`, password = 'Local-Invoice-Fixture-123!';
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(user.error); authIds.push(user.data.user.id);
  const id = randomUUID(); employeeIds.push(id);
  await db.query('insert into employees(id,full_name,position) values($1,$2,$3)', [id, 'Invoice API fixture', role]);
  await db.query('insert into user_profiles(id,employee_id,display_name) values($1,$2,$3)', [user.data.user.id, id, 'Invoice API fixture']);
  const cookies = new Map();
  const client = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(row => cookies.set(row.name, row.value)) } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}
async function request(path, method = 'GET', body, cookie = '') {
  const response = await fetch(appUrl + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const value = await response.json();
  return { response, value };
}
function newInvoice(patch = {}) {
  const id = randomUUID(); invoiceIds.push(id);
  return { id, request_id: randomUUID(), supplier_id: supplierIds[0], invoice_number: `INV-${randomUUID()}`, invoice_date: '2026-10-29', total_amount: '100.50', paid_amount: '0', ...patch };
}
function form(input, file) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, String(value));
  if (file) data.set('document', file.blob, file.name);
  return data;
}
async function save(input, cookie, edit = false, file) {
  return request(`/api/purchase-invoices${edit ? `/${input.id}` : ''}`, edit ? 'PATCH' : 'POST', form(input, file), cookie);
}
(async () => {
  await db.connect();
  try {
    await db.query('insert into categories(id,name) values($1,$2)', [categoryId, `Invoice item ${categoryId}`]);
    await db.query('insert into subcategories(id,category_id,name) values($1,$2,$3)', [subcategoryId, categoryId, 'Invoice item fixture']);
    await db.query(`insert into products(id,sku,name,base_unit,category_id,subcategory_id,cost_price,tax_rate) values
      ($1,$2,'Invoice item priced','Tablet',$3,$4,1000,11),($5,$6,'Invoice item unpriced','Botol',$3,$4,null,0)`, [pricedProduct, `ITEM-${pricedProduct}`, categoryId, subcategoryId, unpricedProduct, `ITEM-${unpricedProduct}`]);
    await db.query(`insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values($1,$2,'Tablet',1,1332,true),($3,$2,'Strip',10,13320,false)`, [baseUnitId, pricedProduct, stripUnitId]);
    await db.query(`insert into product_batches(product_id,batch_number,quantity,cost_price,expired_date,received_date) values($1,'PREVIOUS',5,1000,'2030-01-01','2026-10-29')`, [pricedProduct]);
    const before = await snapshot();
    const owner = await fixture('owner_admin'), staff = await fixture('staf'), cashier = await fixture('kasir');
    for (let i = 0; i < 2; i++) {
      const result = await request('/api/suppliers', 'POST', { name: `Invoice supplier ${randomUUID()}` }, owner);
      assert.equal(result.response.status, 201); supplierIds.push(result.value.data.id);
    }
    const pick = await request('/api/suppliers?q=Invoice%20supplier', 'GET', undefined, owner);
    assert.ok(pick.value.data.rows.some(row => row.id === supplierIds[0]));
    const invoice = newInvoice();
    assert.equal((await save(invoice, '')).response.status, 401);
    assert.equal((await fetch(appUrl + '/api/purchase-invoices', { method: 'POST', headers: { Cookie: owner, Origin: 'https://evil.example.test' }, body: form(invoice) })).status, 403);
    for (const cookie of [staff, cashier]) {
      assert.equal((await save(invoice, cookie)).response.status, 403);
      assert.equal((await request('/api/purchase-invoices', 'GET', undefined, cookie)).response.status, 403);
    }
    assert.equal((await save(invoice, owner)).response.status, 201);
    assert.equal((await save(invoice, owner)).response.status, 201);
    let detail = (await request(`/api/purchase-invoices/${invoice.id}`, 'GET', undefined, owner)).value.data;
    assert.equal(detail.status, 'draft'); assert.equal(detail.version, 1); assert.equal(detail.purchase_invoice_payments.length, 0);
    const duplicate = newInvoice({ invoice_number: ` ${invoice.invoice_number.toLowerCase()} ` });
    assert.equal((await save(duplicate, owner)).response.status, 409);
    const otherSupplier = newInvoice({ invoice_number: invoice.invoice_number, supplier_id: supplierIds[1], paid_amount: '100.50' });
    assert.equal((await save(otherSupplier, owner)).response.status, 201);
    const partial = { ...invoice, request_id: randomUUID(), version: 1, paid_amount: '25.25', invoice_number: `${invoice.invoice_number}-EDIT` };
    assert.equal((await save(partial, owner, true)).response.status, 200);
    assert.equal((await save(partial, owner, true)).response.status, 200);
    detail = (await request(`/api/purchase-invoices/${invoice.id}`, 'GET', undefined, owner)).value.data;
    assert.equal(detail.version, 2); assert.equal(detail.purchase_invoice_payments.length, 1); assert.equal(detail.purchase_invoice_payments[0].amount, 25.25);
    assert.equal((await save({ ...partial, request_id: randomUUID() }, owner, true)).response.status, 409);
    assert.equal((await save({ ...partial, paid_amount: '26' }, owner, true)).response.status, 409);
    const full = { ...partial, request_id: randomUUID(), version: 2, paid_amount: '100.50' };
    assert.equal((await save(full, owner, true)).response.status, 200);
    detail = (await request(`/api/purchase-invoices/${invoice.id}`, 'GET', undefined, owner)).value.data;
    assert.equal(detail.purchase_invoice_payments.length, 1); assert.equal(detail.purchase_invoice_payments[0].amount, 100.5);
    const zero = { ...full, request_id: randomUUID(), version: 3, paid_amount: '0' };
    assert.equal((await save(zero, owner, true)).response.status, 200);
    assert.equal((await request(`/api/purchase-invoices/${invoice.id}`, 'GET', undefined, owner)).value.data.purchase_invoice_payments.length, 0);
    for (const patch of [{ total_amount: '0' }, { paid_amount: '-1' }, { paid_amount: '100.51' }, { invoice_number: '' }, { invoice_date: '2026-02-30' }]) assert.equal((await save(newInvoice(patch), owner)).response.status, 400);
    const pdf = { blob: new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'], { type: 'application/pdf' }), name: 'invoice.pdf' };
    const documentInvoice = newInvoice({ paid_amount: '20' });
    assert.equal((await save(documentInvoice, owner, false, pdf)).response.status, 201);
    assert.equal((await save(documentInvoice, owner, false, pdf)).response.status, 201, 'upload retry is idempotent');
    detail = (await request(`/api/purchase-invoices/${documentInvoice.id}`, 'GET', undefined, owner)).value.data;
    assert.equal(detail.document_name, 'invoice.pdf'); assert.equal(detail.purchase_invoice_payments.length, 1);
    const download = await fetch(`${appUrl}/api/purchase-invoices/${documentInvoice.id}/document`, { headers: { Cookie: owner } });
    assert.equal(download.status, 200); assert.match(download.headers.get('cache-control'), /no-store/); assert.equal(await download.text(), await pdf.blob.text());
    assert.equal((await fetch(`${appUrl}/api/purchase-invoices/${documentInvoice.id}/document`)).status, 401);
    assert.equal((await fetch(`${appUrl}/api/purchase-invoices/${documentInvoice.id}/document`, { headers: { Cookie: staff } })).status, 403);
    assert.equal((await save({ ...documentInvoice, request_id: randomUUID(), version: 1 }, staff, true)).response.status, 403);
    const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    assert.ok((await anon.storage.from('purchase-invoices').download(detail.document_path)).error, 'private document not accessible anonymously');
    const preserve = { ...documentInvoice, request_id: randomUUID(), version: 1, invoice_number: `${documentInvoice.invoice_number}-EDIT` };
    assert.equal((await save(preserve, owner, true)).response.status, 200);
    assert.equal((await request(`/api/purchase-invoices/${documentInvoice.id}`, 'GET', undefined, owner)).value.data.document_path, detail.document_path);
    const png = { blob: new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), name: 'invoice.png' };
    assert.equal((await save({ ...preserve, request_id: randomUUID(), version: 2 }, owner, true, png)).response.status, 200);
    const fake = { blob: new Blob(['fake PDF'], { type: 'application/pdf' }), name: 'fake.pdf' };
    assert.equal((await save(newInvoice(), owner, false, fake)).response.status, 400);
    const oversized = { blob: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'application/pdf' }), name: 'large.pdf' };
    assert.equal((await save(newInvoice(), owner, false, oversized)).response.status, 400);
    const boundaryBytes = new Uint8Array(10 * 1024 * 1024).fill(32);
    boundaryBytes.set(new TextEncoder().encode('%PDF-1.4\n')); boundaryBytes.set(new TextEncoder().encode('%%EOF'), boundaryBytes.length - 5);
    const boundary = { blob: new Blob([boundaryBytes], { type: 'application/pdf' }), name: 'boundary.pdf' };
    assert.equal((await save(newInvoice(), owner, false, boundary)).response.status, 201, '10 MB file plus multipart metadata passes proxy');
    const race = newInvoice({ paid_amount: '10' });
    const races = await Promise.all([save(race, owner), save(race, owner)]);
    assert.deepEqual(races.map(result => result.response.status), [201, 201]);
    assert.equal((await request(`/api/purchase-invoices/${race.id}`, 'GET', undefined, owner)).value.data.purchase_invoice_payments.length, 1);
    const editRaces = await Promise.all([save({ ...race, request_id: randomUUID(), version: 1, paid_amount: '20' }, owner, true), save({ ...race, request_id: randomUUID(), version: 1, paid_amount: '30' }, owner, true)]);
    assert.deepEqual(editRaces.map(result => result.response.status).sort(), [200, 409]);
    for (const path of ['/purchase-invoices', '/purchase-invoices/new', `/purchase-invoices/${invoice.id}`, `/purchase-invoices/${invoice.id}/edit`]) {
      const page = await fetch(appUrl + path, { headers: { Cookie: owner } }); assert.equal(page.status, 200);
      const html = await page.text(); assert.ok(!html.includes('Simpan &amp; Lanjut Isi Barang'));
      assert.ok(html.includes(path.endsWith('/new') || path.endsWith('/edit') ? 'Simpan Invoice' : 'Invoice Pembelian'));
    }
    const list = (await request('/api/purchase-invoices', 'GET', undefined, owner)).value.data;
    assert.ok(list.some(row => row.id === invoice.id));
    // Phase 3: invoice-only snapshots, never stock or price writes.
    const itemPath = `/api/purchase-invoices/${invoice.id}/items`;
    const itemIds = [randomUUID(), randomUUID(), randomUUID()];
    const item = { id: itemIds[0], request_id: randomUUID(), product_id: pricedProduct, product_unit_id: stripUnitId, cost_price: '10000', tax_rate: '11', margin_percent: '20', selling_price: '13320', pricing_mode: 'margin', quantity: '2', batch_number: 'BATCH-A', expired_date: '2030-02-01', expiry_confirmed: true };
    const searchResult = await request(`/api/purchase-invoices/${invoice.id}/products?q=${encodeURIComponent(`ITEM-${pricedProduct}`)}`, 'GET', undefined, owner);
    assert.equal(searchResult.response.status, 200); assert.ok(searchResult.value.data.some(row => row.id === pricedProduct));
    assert.equal((await request(`/api/purchase-invoices/${invoice.id}/products?q=Invoice%20item`, 'GET', undefined, owner)).value.data.length, 2);
    const reference = await request(`/api/purchase-invoices/${invoice.id}/products/${pricedProduct}`, 'GET', undefined, owner);
    assert.equal(reference.value.data.costPrice, 1000); assert.equal(reference.value.data.taxRate, 11); assert.equal(reference.value.data.previousExpiry, '2030-01-01');
    assert.equal(reference.value.data.units.find(row => row.id === stripUnitId).sellingPrice, 13320);
    const unpriced = (await request(`/api/purchase-invoices/${invoice.id}/products/${unpricedProduct}`, 'GET', undefined, owner)).value.data;
    assert.equal(unpriced.costPrice, null); assert.equal(unpriced.units[0].id, null); assert.equal(unpriced.units[0].sellingPrice, null);
    assert.equal((await request(itemPath, 'POST', item)).response.status, 401);
    for (const cookie of [staff, cashier]) {
      assert.equal((await request(itemPath, 'POST', item, cookie)).response.status, 403);
      assert.equal((await request(itemPath, 'GET', undefined, cookie)).response.status, 403);
      assert.equal((await request(`/api/purchase-invoices/${invoice.id}/products?q=test`, 'GET', undefined, cookie)).response.status, 403);
    }
    const itemRace = await Promise.all([request(itemPath, 'POST', item, owner), request(itemPath, 'POST', item, owner)]);
    assert.deepEqual(itemRace.map(result => result.response.status), [201, 201]);
    let rows = (await request(itemPath, 'GET', undefined, owner)).value.data;
    assert.equal(rows.length, 1); assert.equal(rows[0].subtotal, 22200); assert.equal(rows[0].conversion_to_base, 10);
    assert.equal(rows[0].product_name_snapshot, 'Invoice item priced'); assert.equal(rows[0].margin_percent, 20);
    assert.equal((await request(itemPath, 'POST', { ...item, request_id: randomUUID() }, owner)).response.status, 409, 'same item id cannot be recreated');
    assert.equal((await request(itemPath, 'POST', { ...item, quantity: '3' }, owner)).response.status, 409, 'retry key cannot change payload');
    const nextBatch = { ...item, id: itemIds[1], request_id: randomUUID(), batch_number: 'BATCH-B', quantity: '1' };
    assert.equal((await request(itemPath, 'POST', nextBatch, owner)).response.status, 201);
    for (const patch of [{ expiry_confirmed: false }, { expired_date: '2000-01-01' }, { quantity: '0' }, { quantity: '214748365' }, { tax_rate: '101' }, { cost_price: '' }, { selling_price: '', pricing_mode: 'selling_price' }, { product_unit_id: randomUUID() }]) {
      assert.equal((await request(itemPath, 'POST', { ...item, ...patch, id: randomUUID(), request_id: randomUUID() }, owner)).response.status, 400);
    }
    const masterItem = { ...item, id: itemIds[2], request_id: randomUUID(), product_id: unpricedProduct, product_unit_id: null, cost_price: '200', selling_price: '300', tax_rate: '0', margin_percent: '', pricing_mode: 'selling_price', quantity: '3', batch_number: 'NEW-MASTER' };
    assert.equal((await request(itemPath, 'POST', masterItem, owner)).response.status, 201);
    rows = (await request(itemPath, 'GET', undefined, owner)).value.data;
    assert.equal(rows.length, 3); assert.equal(rows.find(row => row.id === itemIds[2]).product_unit_id, null);
    const initialTotal = rows.reduce((sum, row) => sum + row.subtotal, 0); assert.equal(initialTotal, 33900);
    const edits = [request(`${itemPath}/${item.id}`, 'PATCH', { ...item, request_id: randomUUID(), version: 1, quantity: '3' }, owner), request(`${itemPath}/${item.id}`, 'PATCH', { ...item, request_id: randomUUID(), version: 1, quantity: '4' }, owner)];
    assert.deepEqual((await Promise.all(edits)).map(result => result.response.status).sort(), [200, 409]);
    const changed = (await request(itemPath, 'GET', undefined, owner)).value.data.find(row => row.id === item.id);
    const editRequest = { ...item, request_id: randomUUID(), version: changed.version, quantity: '5', selling_price: '14000', pricing_mode: 'selling_price' };
    assert.equal((await request(`${itemPath}/${item.id}`, 'PATCH', editRequest, owner)).response.status, 200);
    assert.equal((await request(`${itemPath}/${item.id}`, 'PATCH', editRequest, owner)).response.status, 200);
    assert.equal((await request(`${itemPath}/${item.id}`, 'PATCH', editRequest, staff)).response.status, 403);
    const deleteRequest = { id: nextBatch.id, request_id: randomUUID(), version: 1 };
    assert.equal((await request(`${itemPath}/${nextBatch.id}`, 'DELETE', deleteRequest, cashier)).response.status, 403);
    assert.equal((await request(`${itemPath}/${nextBatch.id}`, 'DELETE', deleteRequest, owner)).response.status, 200);
    assert.equal((await request(`${itemPath}/${nextBatch.id}`, 'DELETE', deleteRequest, owner)).response.status, 200, 'delete retry is safe');
    assert.equal((await request(`${itemPath}/${nextBatch.id}`, 'PATCH', { ...nextBatch, request_id: randomUUID(), version: 1 }, owner)).response.status, 404, 'deleted snapshot cannot be resurrected');
    const persisted = (await request(itemPath, 'GET', undefined, owner)).value.data;
    assert.equal(persisted.length, 2); assert.equal(persisted.find(row => row.id === item.id).quantity, 5);
    const headerAfter = (await request(`/api/purchase-invoices/${invoice.id}`, 'GET', undefined, owner)).value.data;
    assert.equal(headerAfter.total_amount, 100.5, 'item total never rewrites invoice total');
    assert.equal(headerAfter.version, 4, 'item edits do not invalidate unrelated header edits');
    for (let i = 0; i < 2; i++) {
      const page = await fetch(`${appUrl}/purchase-invoices/${invoice.id}/items`, { headers: { Cookie: owner } });
      assert.equal(page.status, 200); const html = await page.text();
      assert.ok(html.includes('BATCH-A')); assert.ok(html.includes('NEW-MASTER')); assert.ok(!html.includes('BATCH-B')); assert.ok(html.includes('Selisih'));
    }
    const finalizePath = `/api/purchase-invoices/${invoice.id}/finalize`;
    assert.equal((await request(finalizePath)).response.status,401);
    assert.equal((await request(finalizePath,'GET',undefined,staff)).response.status,403);
    const receivingPlan=await request(finalizePath,'GET',undefined,owner);
    assert.equal(receivingPlan.response.status,200); assert.equal(receivingPlan.value.data.item_count,2);
    const receivingBody={request_id:randomUUID(),version:receivingPlan.value.data.version,token:receivingPlan.value.data.token,acknowledge_difference:true};
    assert.equal((await request(finalizePath,'POST',receivingBody,cashier)).response.status,403);
    assert.equal((await request(finalizePath,'POST',{...receivingBody,token:'bad'},owner)).response.status,400);
    const activeOpname=(await db.query("select count(*)::int n from stock_opname_sessions where status='in_progress'")).rows[0].n;
    if(activeOpname) {
      const blocked=await request(finalizePath,'POST',receivingBody,owner);
      assert.equal(blocked.response.status,409);assert.equal(blocked.value.error.code,'STOCK_OPNAME_IN_PROGRESS');
    }
    assert.deepEqual(await snapshot(), before, 'all product, batch and selling unit rows are unchanged');
    console.log('PASS: invoice/payment/documents, item search/reference/master-only, add/edit/delete/batches, retries/concurrency, permission, persistence after reload, unchanged stock/units/prices');
  } finally {
    for (const id of invoiceIds) {
      const objects = await admin.storage.from('purchase-invoices').list(id);
      if (objects.data?.length) assert.ifError((await admin.storage.from('purchase-invoices').remove(objects.data.map(row => `${id}/${row.name}`))).error);
    }
    await db.query('delete from purchase_invoice_items where invoice_id=any($1::uuid[])', [invoiceIds]);
    await db.query('delete from purchase_invoice_requests where invoice_id=any($1::uuid[])', [invoiceIds]);
    await db.query('delete from purchase_invoice_payments where invoice_id=any($1::uuid[])', [invoiceIds]);
    await db.query('delete from purchase_invoices where id=any($1::uuid[])', [invoiceIds]);
    await db.query('delete from suppliers where id=any($1::uuid[])', [supplierIds]);
    for (const id of authIds) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    await db.query('delete from employees where id=any($1::uuid[])', [employeeIds]);
    await db.query('delete from product_batches where product_id=any($1::uuid[])', [[pricedProduct, unpricedProduct]]);
    await db.query('delete from product_units where product_id=any($1::uuid[])', [[pricedProduct, unpricedProduct]]);
    await db.query('delete from products where id=any($1::uuid[])', [[pricedProduct, unpricedProduct]]);
    await db.query('delete from subcategories where id=$1', [subcategoryId]);
    await db.query('delete from categories where id=$1', [categoryId]);
    await db.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
