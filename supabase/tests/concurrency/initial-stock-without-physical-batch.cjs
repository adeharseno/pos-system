/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');
const ids = { category: randomUUID(), owner: randomUUID(), replayProduct: randomUUID(), raceProduct: randomUUID(), replayRequest: randomUUID(), raceRequestA: randomUUID(), raceRequestB: randomUUID() };

async function connect(name) {
  const client = new Client({ connectionString, application_name: `initial-stock-${name}` });
  await client.connect();
  await client.query("set lock_timeout='5s'; set statement_timeout='15s'");
  return client;
}

async function race(calls) {
  const clients = await Promise.all(calls.map((_, index) => connect(`race-${index}`)));
  try { return await Promise.allSettled(calls.map((call, index) => clients[index].query(call.text, call.values))); }
  finally { await Promise.all(clients.map(client => client.end())); }
}

(async () => {
  const control = await connect('control');
  try {
    await control.query('insert into categories(id,name) values($1,$2)', [ids.category, `Initial concurrency ${ids.category}`]);
    await control.query("insert into employees(id,full_name,position) values($1,'Initial concurrency owner','owner_admin')", [ids.owner]);
    await control.query(`insert into products(id,sku,name,base_unit,category_id) values
      ($1,$3,'Initial replay product','Tablet',$5),
      ($2,$4,'Initial race product','Tablet',$5)`, [ids.replayProduct, ids.raceProduct, ids.replayProduct, ids.raceProduct, ids.category]);

    const replayCall = {
      text: 'select receive_initial_product_stock($1,$2,$3,17,5,$4) result',
      values: [ids.replayRequest, ids.owner, ids.replayProduct, 'CONCURRENT-REPLAY'],
    };
    const replayResults = await race([replayCall, replayCall]);
    assert.equal(replayResults.filter(result => result.status === 'fulfilled').length, 2);
    assert.deepEqual(replayResults.map(result => result.value.rows[0].result.replayed).sort(), [false, true]);
    assert.equal(Number((await control.query('select count(*) count from product_batches where product_id=$1', [ids.replayProduct])).rows[0].count), 1);
    assert.equal((await control.query('select quantity from product_batches where product_id=$1', [ids.replayProduct])).rows[0].quantity, 17);
    assert.equal(Number((await control.query('select count(*) count from manual_stock_receiving_events where product_id=$1', [ids.replayProduct])).rows[0].count), 1);

    const raceCall = requestId => ({
      text: 'select receive_initial_product_stock($1,$2,$3,9,4,null) result',
      values: [requestId, ids.owner, ids.raceProduct],
    });
    const differentRequests = await race([raceCall(ids.raceRequestA), raceCall(ids.raceRequestB)]);
    assert.equal(differentRequests.filter(result => result.status === 'fulfilled').length, 1);
    const failure = differentRequests.find(result => result.status === 'rejected');
    assert.equal(failure.reason.message, 'INITIAL_STOCK_ALREADY_EXISTS');
    assert.notEqual(failure.reason.code, '40P01');
    assert.equal(Number((await control.query('select count(*) count from product_batches where product_id=$1', [ids.raceProduct])).rows[0].count), 1);
    assert.equal((await control.query('select quantity from product_batches where product_id=$1', [ids.raceProduct])).rows[0].quantity, 9);
    assert.equal(Number((await control.query('select count(*) count from manual_stock_receiving_events where product_id=$1', [ids.raceProduct])).rows[0].count), 1);
    process.stdout.write('PASS: initial stock retry and competing request concurrency are safe\n');
  } finally {
    await control.query('delete from manual_stock_receiving_events where product_id in ($1,$2)', [ids.replayProduct, ids.raceProduct]).catch(() => {});
    await control.query('delete from manual_stock_receiving_requests where product_id in ($1,$2)', [ids.replayProduct, ids.raceProduct]).catch(() => {});
    await control.query('delete from product_batches where product_id in ($1,$2)', [ids.replayProduct, ids.raceProduct]).catch(() => {});
    await control.query('delete from products where id in ($1,$2)', [ids.replayProduct, ids.raceProduct]).catch(() => {});
    await control.query('delete from employees where id=$1', [ids.owner]).catch(() => {});
    await control.query('delete from categories where id=$1', [ids.category]).catch(() => {});
    await control.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
