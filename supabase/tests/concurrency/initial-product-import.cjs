/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');

const run = randomUUID().slice(0, 8);
const ids = {
  category: randomUUID(),
  subcategory: randomUUID(),
  supplier: randomUUID(),
  owner: randomUUID(),
  cashier: randomUUID(),
  replayRequest: randomUUID(),
  raceRequestA: randomUUID(),
  raceRequestB: randomUUID(),
};

async function connect(name) {
  const client = new Client({ connectionString, application_name: `initial-import-${name}` });
  await client.connect();
  await client.query("set lock_timeout='10s'; set statement_timeout='30s'");
  return client;
}

async function race(calls) {
  const clients = await Promise.all(calls.map((_, index) => connect(`race-${index}`)));
  try {
    return await Promise.allSettled(calls.map((call, index) => clients[index].query(call.text, call.values)));
  } finally {
    await Promise.all(clients.map(client => client.end()));
  }
}

function row(suffix, stock) {
  return {
    sku: `IMP-${run}-${suffix}`,
    name: `Import concurrency ${suffix}`,
    base_unit: 'TAB',
    selling_price: 1000,
    cost_price: 0,
    stock,
    category_name: `Import concurrency ${run}`,
    subcategory_name: `Import concurrency ${run}`,
    supplier_text: null,
    drug_classification: 'otc',
  };
}

function importCall(requestId, rows) {
  return {
    text: 'select import_initial_products($1,$2,$3::jsonb) result',
    values: [requestId, ids.owner, JSON.stringify(rows)],
  };
}

async function cleanup(control, skuPattern) {
  await control.query('delete from initial_product_import_requests where request_id in ($1,$2,$3)', [ids.replayRequest, ids.raceRequestA, ids.raceRequestB]);
  await control.query('delete from manual_stock_receiving_events where product_id in (select id from products where sku like $1)', [skuPattern]);
  await control.query('delete from manual_stock_receiving_requests where product_id in (select id from products where sku like $1)', [skuPattern]);
  await control.query('delete from product_batches where product_id in (select id from products where sku like $1)', [skuPattern]);
  await control.query('delete from product_units where product_id in (select id from products where sku like $1)', [skuPattern]);
  await control.query('delete from products where sku like $1', [skuPattern]);
}

(async () => {
  const control = await connect('control');
  try {
    const existing = await control.query('select count(*)::int count from products');
    if (existing.rows[0].count !== 0) throw new Error('REFUSING_NON_EMPTY_PRODUCT_DATABASE');

    await control.query('insert into categories(id,name) values($1,$2)', [ids.category, `Import concurrency ${run}`]);
    await control.query('insert into subcategories(id,name) values($1,$2)', [ids.subcategory, `Import concurrency ${run}`]);
    await control.query('insert into suppliers(id,name) values($1,$2)', [ids.supplier, `Import concurrency ${run}`]);
    await control.query("insert into employees(id,full_name,position) values($1,'Import concurrency owner','owner_admin'),($2,'Import concurrency cashier','kasir')", [ids.owner, ids.cashier]);

    const sameRequest = importCall(ids.replayRequest, [row('R1', 7), row('R2', 3)]);
    const replayResults = await race([sameRequest, sameRequest]);
    assert.equal(replayResults.filter(result => result.status === 'fulfilled').length, 2);
    assert.deepEqual(replayResults.map(result => result.value.rows[0].result.replayed).sort(), [false, true]);
    assert.equal(Number((await control.query('select count(*) count from products where sku like $1', [`IMP-${run}-%`])).rows[0].count), 2);
    assert.equal(Number((await control.query("select count(*) count from manual_stock_receiving_events where source='initial' and product_id in (select id from products where sku like $1)", [`IMP-${run}-%`])).rows[0].count), 2);
    assert.equal(Number((await control.query('select sum(quantity)::int total from product_batches where product_id in (select id from products where sku like $1)', [`IMP-${run}-%`])).rows[0].total), 10);

    await cleanup(control, `IMP-${run}-%`);

    const differentRequests = await race([
      importCall(ids.raceRequestA, [row('A', 4)]),
      importCall(ids.raceRequestB, [row('B', 6)]),
    ]);
    assert.equal(differentRequests.filter(result => result.status === 'fulfilled').length, 1);
    const failure = differentRequests.find(result => result.status === 'rejected');
    assert.equal(failure.reason.message, 'INITIAL_IMPORT_REQUIRES_EMPTY_PRODUCTS');
    assert.notEqual(failure.reason.code, '40P01');
    assert.equal(Number((await control.query('select count(*) count from products where sku like $1', [`IMP-${run}-%`])).rows[0].count), 1);
    assert.equal(Number((await control.query("select count(*) count from manual_stock_receiving_events where source='initial' and product_id in (select id from products where sku like $1)", [`IMP-${run}-%`])).rows[0].count), 1);

    process.stdout.write('PASS: initial import retry and competing submission concurrency are safe\n');
  } finally {
    await cleanup(control, `IMP-${run}-%`).catch(() => {});
    await control.query('delete from suppliers where id=$1', [ids.supplier]).catch(() => {});
    await control.query('delete from subcategories where id=$1', [ids.subcategory]).catch(() => {});
    await control.query('delete from categories where id=$1', [ids.category]).catch(() => {});
    await control.query('delete from employees where id in ($1,$2)', [ids.owner, ids.cashier]).catch(() => {});
    await control.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
