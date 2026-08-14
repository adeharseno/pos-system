/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const parsedUrl = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) {
  throw new Error('REFUSING_NON_LOCAL_DATABASE');
}

const iterations = Number(process.env.CONCURRENCY_ITERATIONS || 10);
const scenarios = [];
let checks = 0;
let deadlocks = 0;
let lockTimeouts = 0;

function assert(value, message) {
  checks++;
  if (!value) throw new Error(`ASSERTION_FAILED: ${message}`);
}

function messageOf(result) {
  return result.status === 'rejected' ? String(result.reason?.message || result.reason) : '';
}

async function connection(name = 'm15') {
  const client = new Client({ connectionString: databaseUrl, application_name: `m15-${name}` });
  await client.connect();
  await client.query("set lock_timeout = '5s'; set statement_timeout = '15s'");
  return client;
}

async function withClient(fn) {
  const client = await connection('control');
  try { return await fn(client); } finally { await client.end(); }
}

async function race(calls) {
  const clients = await Promise.all(calls.map((_, index) => connection(`race-${index}`)));
  try {
    const results = await Promise.allSettled(calls.map((call, index) => clients[index].query(call.text, call.values || [])));
    for (const result of results) {
      if (result.status === 'rejected' && result.reason?.code === '40P01') deadlocks++;
      if (result.status === 'rejected' && result.reason?.code === '55P03') lockTimeouts++;
    }
    return results;
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
}

// The winner keeps its transaction open after the RPC has acquired/updated the
// lifecycle row. The loser is submitted on another connection before commit,
// so it must wait for the real PostgreSQL row lock and then re-check state.
async function serializedRace(winner, loser) {
  const winnerClient = await connection('forced-winner');
  const loserClient = await connection('forced-loser');
  try {
    await winnerClient.query('begin');
    const winnerResult = await winnerClient.query(winner.text, winner.values || []);
    const loserPromise = loserClient.query(loser.text, loser.values || []);
    await new Promise((resolve) => setImmediate(resolve));
    await winnerClient.query('commit');
    const loserResult = await Promise.allSettled([loserPromise]);
    return [{ status: 'fulfilled', value: winnerResult }, loserResult[0]];
  } catch (error) {
    await winnerClient.query('rollback').catch(() => {});
    throw error;
  } finally {
    await Promise.all([winnerClient.end(), loserClient.end()]);
  }
}

async function clean(client) {
  await client.query('truncate table public.categories, public.employees, public.storage_locations, public.invoice_sequences cascade');
}

async function seed(client, options = {}) {
  await clean(client);
  const ids = {
    category: randomUUID(), subcategory: randomUUID(), location: randomUUID(),
    product: randomUUID(), unit: randomUUID(), cashier: randomUUID(), owner: randomUUID(), drawer: randomUUID(),
    batch1: randomUUID(), batch2: randomUUID(),
  };
  await client.query("insert into public.categories(id,name) values($1,'Concurrency')", [ids.category]);
  await client.query("insert into public.subcategories(id,category_id,name) values($1,$2,'Concurrency')", [ids.subcategory, ids.category]);
  await client.query("insert into public.storage_locations(id,zone_code,rack_code,level_code,full_code) values($1,'CZ','CR','CL',$2)", [ids.location, ids.location]);
  await client.query(`insert into public.products(id,sku,name,category_id,subcategory_id,base_unit,storage_location_id)
    values($1,$2,'Concurrent product',$3,$4,'tablet',$5)`, [ids.product, ids.product, ids.category, ids.subcategory, ids.location]);
  await client.query(`insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
    values($1,$2,'tablet',1,100,true)`, [ids.unit, ids.product]);
  await client.query("insert into public.employees(id,full_name,position) values($1,'Cashier','kasir'),($2,'Owner','owner_admin')", [ids.cashier, ids.owner]);
  await client.query('insert into public.cash_drawer_sessions(id,employee_id,opening_balance) values($1,$2,100000)', [ids.drawer, ids.cashier]);
  const stock1 = options.stock1 ?? 10;
  await client.query(`insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at)
    values($1,$2,'EARLY','2028-01-01',$3,50,'2026-01-01')`, [ids.batch1, ids.product, stock1]);
  if (options.stock2 != null) {
    await client.query(`insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at)
      values($1,$2,'LATE','2029-01-01',$3,60,'2026-01-02')`, [ids.batch2, ids.product, options.stock2]);
  }
  return ids;
}

function checkoutCall(ids, quantity, method = 'cash') {
  return {
    text: `select public.checkout_transaction($1,$2,$3,$4::jsonb,$5,null) result`,
    values: [ids.cashier, ids.drawer, method,
      JSON.stringify([{ product_unit_id: ids.unit, quantity }]), method === 'cash' ? 100000 : null],
  };
}

async function checkout(client, ids, quantity, method = 'cash') {
  const result = await client.query(checkoutCall(ids, quantity, method));
  return result.rows[0].result.transaction_id;
}

function successes(results) { return results.filter((result) => result.status === 'fulfilled'); }
function failures(results) { return results.filter((result) => result.status === 'rejected'); }

async function run(name, fn, repeat = iterations) {
  for (let index = 0; index < repeat; index++) {
    try {
      await withClient(async (client) => {
        await fn(client, index);
        await clean(client);
      });
    } catch (error) {
      scenarios.push({ name, iteration: index + 1, ok: false, error: error.message });
      throw error;
    }
  }
  scenarios.push({ name, iterations: repeat, ok: true });
  process.stdout.write(`ok - ${name} (${repeat} iterations)\n`);
}

async function checkoutRace(client, stock, expectedSuccess, expectedQuantity) {
  const ids = await seed(client, { stock1: stock });
  const results = await race([checkoutCall(ids, 10), checkoutCall(ids, 10)]);
  assert(successes(results).length === expectedSuccess, 'unexpected checkout success count');
  assert((await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity === expectedQuantity, 'wrong final checkout stock');
  assert((await client.query('select count(*)::int count from public.product_batches where quantity<0')).rows[0].count === 0, 'negative stock');
  if (expectedSuccess === 1) assert(failures(results).some((r) => messageOf(r).includes('INSUFFICIENT_STOCK')), 'race loser lacks stock domain error');
}

async function prepareSale(client, quantity = 10, stock = 20, method = 'cash') {
  const ids = await seed(client, { stock1: stock });
  ids.transaction = await checkout(client, ids, quantity, method);
  ids.item = (await client.query('select id from public.transaction_items where transaction_id=$1',[ids.transaction])).rows[0].id;
  return ids;
}

function returnCall(ids, quantity) {
  return { text:'select public.create_customer_return($1,$2,\'qris\',null,\'race\',$3::jsonb)',
    values:[ids.cashier,ids.transaction,JSON.stringify([{transaction_item_id:ids.item,quantity_in_base:quantity}])] };
}

async function main() {
  await run('checkout vs checkout (10/10 stock)', (c) => checkoutRace(c,10,1,0));
  await run('partial checkout (15 stock)', (c) => checkoutRace(c,15,1,5));
  await run('partial checkout (20 stock)', (c) => checkoutRace(c,20,2,0));

  await run('concurrent invoice generation', async (client) => {
    const ids = await seed(client,{stock1:100});
    const results = await race(Array.from({length:10},()=>checkoutCall(ids,1)));
    assert(successes(results).length===10,'not all invoice checkouts succeeded');
    const row=(await client.query('select count(*)::int total,count(distinct invoice_number)::int unique_count,max(last_number)::int seq from public.transactions cross join public.invoice_sequences group by last_number')).rows[0];
    assert(row.total===10 && row.unique_count===10 && row.seq===10,'invoice uniqueness/sequence invariant failed');
  });

  await run('FEFO concurrency', async (client) => {
    const ids=await seed(client,{stock1:10,stock2:20});
    const results=await race([checkoutCall(ids,8),checkoutCall(ids,8)]);
    assert(successes(results).length===2,'FEFO purchases failed');
    const batches=await client.query('select id,quantity from public.product_batches order by expired_date');
    assert(batches.rows[0].quantity===0 && batches.rows[1].quantity===14,'FEFO final stock incorrect');
    const invariant=await client.query(`select coalesce(sum(ti.quantity_in_base),0)::int sold,coalesce(sum(tib.quantity_in_base),0)::int allocated from public.transaction_items ti cross join lateral (select sum(quantity_in_base) quantity_in_base from public.transaction_item_batches where transaction_item_id=ti.id) tib`);
    assert(invariant.rows[0].sold===16 && invariant.rows[0].allocated===16,'allocation mismatch');
  });

  await run('return vs return (7 + 7)', async (client) => {
    const ids=await prepareSale(client);
    const results=await race([returnCall(ids,7),returnCall(ids,7)]);
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('RETURN_QUANTITY_EXCEEDED'),'return race outcome incorrect');
    const returned=(await client.query('select coalesce(sum(quantity_in_base),0)::int value from public.return_items')).rows[0].value;
    const stock=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    assert(returned===7 && stock===17,'excess return or restoration');
  });
  await run('return vs return (4 + 6)', async (client) => {
    const ids=await prepareSale(client);
    const results=await race([returnCall(ids,4),returnCall(ids,6)]);
    assert(successes(results).length===2,'valid concurrent returns did not both succeed');
    assert((await client.query('select sum(quantity_in_base)::int value from public.return_items')).rows[0].value===10,'valid returns total mismatch');
  });

  await run('void vs void', async (client) => {
    const ids=await prepareSale(client);
    const call={text:'select public.void_transaction($1,$2,\'race\')',values:[ids.transaction,ids.cashier]};
    const results=await race([call,call]);
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('TRANSACTION_ALREADY_VOIDED'),'double void not rejected');
    assert((await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity===20,'void restored more than once');
  });

  await run('QRIS confirm vs confirm', async (client) => {
    const ids=await prepareSale(client,1,10,'qris');
    const call={text:'select public.confirm_qris_payment($1,$2)',values:[ids.transaction,ids.cashier]};
    const results=await race([call,call]);
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('QRIS_ALREADY_CONFIRMED'),'duplicate confirmation not rejected');
    assert((await client.query('select status from public.transactions where id=$1',[ids.transaction])).rows[0].status==='completed','QRIS final state invalid');
  });

  await run('QRIS confirm vs void (confirm wins)', async (client) => {
    const ids=await prepareSale(client,1,10,'qris');
    const results=await serializedRace(
      {text:'select public.confirm_qris_payment($1,$2)',values:[ids.transaction,ids.cashier]},
      {text:'select public.void_transaction($1,$2,\'race\')',values:[ids.transaction,ids.cashier]}
    );
    const tx=(await client.query('select status,payment_confirmed_at from public.transactions where id=$1',[ids.transaction])).rows[0];
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('PAID_TRANSACTION_REQUIRES_RETURN'),'void did not reject confirmed QRIS');
    assert(tx.status==='completed' && tx.payment_confirmed_at,'confirm winner metadata invalid');
    const stock=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    assert(stock===9,'confirmed QRIS stock was incorrectly restored');
  });

  await run('QRIS confirm vs void (void wins)', async (client) => {
    const ids=await prepareSale(client,1,10,'qris');
    const results=await serializedRace(
      {text:'select public.void_transaction($1,$2,\'race\')',values:[ids.transaction,ids.cashier]},
      {text:'select public.confirm_qris_payment($1,$2)',values:[ids.transaction,ids.cashier]}
    );
    const tx=(await client.query('select status,payment_confirmed_at,payment_confirmed_by from public.transactions where id=$1',[ids.transaction])).rows[0];
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('INVALID_TRANSACTION_STATE'),'confirmation did not reject voided QRIS');
    assert(tx.status==='voided' && tx.payment_confirmed_at===null && tx.payment_confirmed_by===null,'void winner created forbidden mixed state');
    assert((await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity===10,'void winner did not restore stock exactly once');
  });

  await run('customer return vs void', async (client) => {
    const ids=await prepareSale(client);
    const results=await race([returnCall(ids,4),{text:'select public.void_transaction($1,$2,\'race\')',values:[ids.transaction,ids.cashier]}]);
    assert(successes(results).length===1,'return and void both changed inventory');
    const tx=(await client.query('select status from public.transactions where id=$1',[ids.transaction])).rows[0].status;
    const returns=(await client.query('select count(*)::int count from public.returns')).rows[0].count;
    const stock=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    assert((tx==='voided'&&returns===0&&stock===20)||(tx==='completed'&&returns===1&&stock===14),'return/void invariant failed');
  });

  await run('opname start vs checkout', async (client) => {
    const ids=await seed(client,{stock1:10});
    const results=await race([{text:'select public.start_stock_opname($1,null)',values:[ids.owner]},checkoutCall(ids,1)]);
    const batch=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    const snap=(await client.query('select oi.system_quantity from public.stock_opname_items oi join public.stock_opname_sessions os on os.id=oi.session_id where os.status=\'in_progress\' and oi.batch_id=$1',[ids.batch1])).rows[0].system_quantity;
    assert(batch===snap,'checkout mutated inventory after opname snapshot');
    assert(successes(results).length>=1,'opname/checkout produced no winner');
  });

  await run('opname start vs customer return', async (client) => {
    const ids=await prepareSale(client);
    await race([{text:'select public.start_stock_opname($1,null)',values:[ids.owner]},returnCall(ids,4)]);
    const batch=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    const snap=(await client.query('select system_quantity from public.stock_opname_items where batch_id=$1',[ids.batch1])).rows[0].system_quantity;
    assert(batch===snap,'customer return mutated frozen snapshot');
  });

  await run('opname start vs supplier return', async (client) => {
    const ids=await seed(client,{stock1:10});
    const supplier={text:'select public.create_supplier_return($1,\'race\',$2::jsonb)',values:[ids.owner,JSON.stringify([{product_id:ids.product,batch_id:ids.batch1,quantity_in_base:1}])]};
    await race([{text:'select public.start_stock_opname($1,null)',values:[ids.owner]},supplier]);
    const batch=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    const snap=(await client.query('select system_quantity from public.stock_opname_items where batch_id=$1',[ids.batch1])).rows[0].system_quantity;
    assert(batch===snap,'supplier return mutated frozen snapshot');
  });

  await run('opname apply vs stock mutation', async (client) => {
    const ids=await seed(client,{stock1:10});
    const session=(await client.query('select public.start_stock_opname($1,null) result',[ids.owner])).rows[0].result.session_id;
    await client.query('update public.stock_opname_items set physical_quantity=12 where session_id=$1',[session]);
    const supplier={text:'select public.create_supplier_return($1,\'race\',$2::jsonb)',values:[ids.owner,JSON.stringify([{product_id:ids.product,batch_id:ids.batch1,quantity_in_base:1}])]};
    await race([{text:'select public.apply_stock_opname($1,$2)',values:[session,ids.owner]},supplier]);
    const quantity=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    assert([11,12].includes(quantity),'lost update during opname apply');
  });

  await run('opname apply vs cancel', async (client) => {
    const ids=await seed(client,{stock1:10});
    const session=(await client.query('select public.start_stock_opname($1,null) result',[ids.owner])).rows[0].result.session_id;
    await client.query('update public.stock_opname_items set physical_quantity=12 where session_id=$1',[session]);
    const results=await race([{text:'select public.apply_stock_opname($1,$2)',values:[session,ids.owner]},{text:'select public.cancel_stock_opname($1,$2)',values:[session,ids.owner]}]);
    assert(successes(results).length===1,'apply and cancel both succeeded');
    const state=(await client.query('select status from public.stock_opname_sessions where id=$1',[session])).rows[0].status;
    const quantity=(await client.query('select quantity from public.product_batches where id=$1',[ids.batch1])).rows[0].quantity;
    assert((state==='applied'&&quantity===12)||(state==='cancelled'&&quantity===10),'opname lifecycle/quantity mismatch');
  });

  await run('multiple opname starts', async (client) => {
    const ids=await seed(client,{stock1:10});
    const call={text:'select public.start_stock_opname($1,null)',values:[ids.owner]};
    const results=await race([call,call]);
    assert(successes(results).length===1 && messageOf(failures(results)[0]).includes('STOCK_OPNAME_IN_PROGRESS'),'multiple opname starts not serialized');
    assert((await client.query("select count(*)::int count from public.stock_opname_sessions where status='in_progress'")).rows[0].count===1,'multiple active opnames');
  });

  assert(deadlocks===0,'deadlock detected');
  assert(lockTimeouts===0,'lock timeout detected');
  process.stdout.write(JSON.stringify({status:'PASS',scenario_groups:scenarios.length,scenario_runs:scenarios.reduce((n,s)=>n+(s.iterations||1),0),checks,deadlocks,lock_timeouts:lockTimeouts},null,2)+'\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.stderr.write(JSON.stringify({status:'FAIL',scenarios,checks,deadlocks,lock_timeouts:lockTimeouts},null,2)+'\n');
  process.exitCode=1;
});
