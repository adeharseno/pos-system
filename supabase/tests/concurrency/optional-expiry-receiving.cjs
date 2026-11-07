/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');
const ids = {
  category: randomUUID(), supplier: randomUUID(), owner: randomUUID(), product: randomUUID(), unit: randomUUID(),
  manualRequest: randomUUID(), invoice: randomUUID(), item: randomUUID(), itemRequest: randomUUID(), finalizeRequest: randomUUID(),
};

async function connect(name) {
  const client = new Client({ connectionString, application_name: `optional-expiry-receiving-${name}` });
  await client.connect();
  await client.query("set lock_timeout='5s'; set statement_timeout='15s'");
  return client;
}

(async () => {
  const control = await connect('control');
  try {
    await control.query('insert into categories(id,name) values($1,$2)', [ids.category, `Optional receiving ${ids.category}`]);
    await control.query('insert into suppliers(id,name) values($1,$2)', [ids.supplier, `Optional supplier ${ids.supplier}`]);
    await control.query("insert into employees(id,full_name,position) values($1,'Optional Receiving Owner','owner_admin')", [ids.owner]);
    await control.query("insert into products(id,sku,name,base_unit,category_id,cost_price) values($1,$2,'Optional Receiving Concurrent','Tablet',$3,5)", [ids.product, ids.product, ids.category]);
    await control.query("insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values($1,$2,'Tablet',1,20,true)", [ids.unit, ids.product]);

    const manualCall = {
      text: "select receive_product_stock_manual($1,$2,$3,$4::jsonb,'Concurrent null expiry',null,null) result",
      values: [ids.manualRequest, ids.owner, ids.product, JSON.stringify([{ batch_number: 'CONCURRENT-MANUAL-NULL', expired_date: null, quantity: 9, cost_price: 5 }])],
    };
    const manualClients = await Promise.all([connect('manual-a'), connect('manual-b')]);
    let manualResults;
    try { manualResults = await Promise.all(manualClients.map(client => client.query(manualCall.text, manualCall.values))); }
    finally { await Promise.all(manualClients.map(client => client.end())); }
    assert.deepEqual(manualResults.map(result => result.rows[0].result.replayed).sort(), [false, true]);
    assert.equal(Number((await control.query('select count(*) count from manual_stock_receiving_events where request_id=$1', [ids.manualRequest])).rows[0].count), 1);
    assert.equal((await control.query("select quantity from product_batches where product_id=$1 and batch_number='CONCURRENT-MANUAL-NULL' and expired_date is null", [ids.product])).rows[0].quantity, 9);

    await control.query(`insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by)
      values($1,$2,$3,current_date,30,$4,$4)`, [ids.invoice, ids.supplier, ids.invoice, ids.owner]);
    const payload = { product_id: ids.product, product_unit_id: ids.unit, cost_price: '10.00', tax_rate: '0', selling_price: '20.00', margin_percent: null, pricing_mode: 'selling_price', quantity: '3', batch_number: 'CONCURRENT-INVOICE-NULL', expired_date: null };
    await control.query("select write_purchase_invoice_item($1,$2,$3,$4,null,'create',$5::jsonb)", [ids.invoice, ids.item, ids.itemRequest, ids.owner, payload]);
    const plan = (await control.query('select preview_purchase_receiving($1,$2) value', [ids.invoice, ids.owner])).rows[0].value;
    const finalizeCall = {
      text: 'select finalize_purchase_receiving($1,$2,$3,$4,$5,true) result',
      values: [ids.invoice, ids.owner, ids.finalizeRequest, plan.version, plan.token],
    };
    const invoiceClients = await Promise.all([connect('invoice-a'), connect('invoice-b')]);
    let invoiceResults;
    try { invoiceResults = await Promise.all(invoiceClients.map(client => client.query(finalizeCall.text, finalizeCall.values))); }
    finally { await Promise.all(invoiceClients.map(client => client.end())); }
    assert.deepEqual(invoiceResults.map(result => result.rows[0].result.replayed).sort(), [false, true]);
    assert.equal(Number((await control.query('select count(*) count from purchase_invoice_receipts where invoice_id=$1', [ids.invoice])).rows[0].count), 1);
    assert.equal((await control.query("select quantity from product_batches where product_id=$1 and batch_number='CONCURRENT-INVOICE-NULL' and expired_date is null", [ids.product])).rows[0].quantity, 3);
    assert.equal(Number((await control.query("select count(*) count from manual_stock_receiving_events where product_id=$1 and batch_id=(select id from product_batches where product_id=$1 and batch_number='CONCURRENT-INVOICE-NULL' and expired_date is null)", [ids.product])).rows[0].count), 0);
    process.stdout.write('PASS: concurrent manual and invoice null-expiry retries are idempotent\n');
  } finally {
    await control.query('delete from purchase_invoice_receipts where invoice_id=$1', [ids.invoice]).catch(() => {});
    await control.query('delete from manual_stock_receiving_events where request_id=$1', [ids.manualRequest]).catch(() => {});
    await control.query('delete from manual_stock_receiving_requests where request_id=$1', [ids.manualRequest]).catch(() => {});
    await control.query('delete from product_batches where product_id=$1', [ids.product]).catch(() => {});
    await control.query('delete from purchase_invoice_requests where invoice_id=$1', [ids.invoice]).catch(() => {});
    await control.query('delete from purchase_invoice_items where invoice_id=$1', [ids.invoice]).catch(() => {});
    await control.query('delete from purchase_invoices where id=$1', [ids.invoice]).catch(() => {});
    await control.query('delete from product_units where product_id=$1', [ids.product]).catch(() => {});
    await control.query('delete from products where id=$1', [ids.product]).catch(() => {});
    await control.query('delete from employees where id=$1', [ids.owner]).catch(() => {});
    await control.query('delete from suppliers where id=$1', [ids.supplier]).catch(() => {});
    await control.query('delete from categories where id=$1', [ids.category]).catch(() => {});
    await control.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
