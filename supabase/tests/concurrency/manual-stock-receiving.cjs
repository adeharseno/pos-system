/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1','localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');
const ids = { category: randomUUID(), product: randomUUID(), owner: randomUUID(), request: randomUUID() };
const batchNumber = `CONCURRENT-${ids.request}`;

async function client(name) {
  const value = new Client({ connectionString, application_name: `manual-receiving-${name}` });
  await value.connect();
  await value.query("set lock_timeout='5s'; set statement_timeout='15s'");
  return value;
}

(async () => {
  const control = await client('control');
  try {
    await control.query('insert into public.categories(id,name) values($1,$2)',[ids.category,`Concurrent ${ids.category}`]);
    await control.query("insert into public.products(id,sku,name,base_unit,category_id) values($1,$2,'Concurrent manual receiving','Tablet',$3)",[ids.product,ids.product,ids.category]);
    await control.query("insert into public.employees(id,full_name,position) values($1,'Concurrent Owner','owner_admin')",[ids.owner]);
    const call = {
      text: "select public.receive_product_stock_manual($1,$2,$3,$4::jsonb,'Concurrent test',null,null) result",
      values: [ids.request,ids.owner,ids.product,JSON.stringify([{batch_number:batchNumber,expired_date:'2035-01-01',quantity:17,cost_price:50}])],
    };
    const clients = await Promise.all([client('race-a'),client('race-b')]);
    let results;
    try { results = await Promise.all(clients.map(value => value.query(call.text,call.values))); }
    finally { await Promise.all(clients.map(value => value.end())); }
    assert.equal(results.length,2);
    assert.deepEqual(results.map(value => value.rows[0].result.replayed).sort(),[false,true]);
    assert.equal(Number((await control.query('select count(*) count from public.manual_stock_receiving_requests where request_id=$1',[ids.request])).rows[0].count),1);
    assert.equal(Number((await control.query('select count(*) count from public.manual_stock_receiving_events where request_id=$1',[ids.request])).rows[0].count),1);
    assert.equal((await control.query('select quantity from public.product_batches where product_id=$1 and batch_number=$2',[ids.product,batchNumber])).rows[0].quantity,17);
    process.stdout.write('PASS: concurrent duplicate request produced one batch and one immutable event\n');
  } finally {
    await control.query('delete from public.manual_stock_receiving_events where request_id=$1',[ids.request]).catch(()=>{});
    await control.query('delete from public.manual_stock_receiving_requests where request_id=$1',[ids.request]).catch(()=>{});
    await control.query('delete from public.product_batches where product_id=$1',[ids.product]).catch(()=>{});
    await control.query('delete from public.products where id=$1',[ids.product]).catch(()=>{});
    await control.query('delete from public.employees where id=$1',[ids.owner]).catch(()=>{});
    await control.query('delete from public.categories where id=$1',[ids.category]).catch(()=>{});
    await control.end();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
