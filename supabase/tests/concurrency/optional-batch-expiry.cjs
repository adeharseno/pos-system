/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');

const ids = {
  category: randomUUID(), product: randomUUID(), unit: randomUUID(), cashier: randomUUID(),
  datedBatch: randomUUID(), unknownBatch: randomUUID(), duplicateProduct: randomUUID(),
};

async function connect(name) {
  const client = new Client({ connectionString, application_name: `optional-expiry-${name}` });
  await client.connect();
  await client.query("set lock_timeout='5s'; set statement_timeout='15s'");
  return client;
}

(async () => {
  const control = await connect('control');
  try {
    await control.query('insert into public.categories(id,name) values($1,$2)', [ids.category, `Optional expiry ${ids.category}`]);
    await control.query(`insert into public.products(id,sku,name,base_unit,category_id) values
      ($1,$4,'Optional expiry concurrent sale','Tablet',$3),
      ($2,$5,'Optional expiry duplicate identity','Tablet',$3)`, [ids.product, ids.duplicateProduct, ids.category, ids.product, ids.duplicateProduct]);
    await control.query("insert into public.product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values($1,$2,'Tablet',1,100,true)", [ids.unit, ids.product]);
    await control.query("insert into public.employees(id,full_name,position) values($1,'Optional Expiry Cashier','kasir')", [ids.cashier]);
    await control.query(`insert into public.product_batches(id,product_id,batch_number,expired_date,quantity,cost_price,created_at) values
      ($1,$3,'DATED','2035-01-01',5,10,'2026-01-01'),
      ($2,$3,'UNKNOWN',null,10,20,'2026-01-02')`, [ids.datedBatch, ids.unknownBatch, ids.product]);

    const checkout = {
      text: "select checkout_transaction($1,'cash',$2::jsonb,1000,null) result",
      values: [ids.cashier, JSON.stringify([{ product_unit_id: ids.unit, quantity: 6 }])],
    };
    const saleClients = await Promise.all([connect('sale-a'), connect('sale-b')]);
    let sales;
    try { sales = await Promise.allSettled(saleClients.map(client => client.query(checkout.text, checkout.values))); }
    finally { await Promise.all(saleClients.map(client => client.end())); }
    assert.equal(sales.filter(result => result.status === 'fulfilled').length, 2, 'both serialized checkouts must succeed');
    assert.equal(sales.some(result => result.status === 'rejected' && result.reason?.code === '40P01'), false, 'checkout must not deadlock');
    const balances = await control.query('select id,quantity from product_batches where id=any($1::uuid[])', [[ids.datedBatch, ids.unknownBatch]]);
    const byId = new Map(balances.rows.map(row => [row.id, row.quantity]));
    assert.equal(byId.get(ids.datedBatch), 0, 'dated batch must be consumed before null expiry');
    assert.equal(byId.get(ids.unknownBatch), 3, 'null-expiry batch must carry the remaining stock');

    const insert = {
      text: "insert into product_batches(product_id,batch_number,expired_date,quantity,cost_price) values($1,'SAME-NULL',null,1,1)",
      values: [ids.duplicateProduct],
    };
    const insertClients = await Promise.all([connect('identity-a'), connect('identity-b')]);
    let inserts;
    try { inserts = await Promise.allSettled(insertClients.map(client => client.query(insert.text, insert.values))); }
    finally { await Promise.all(insertClients.map(client => client.end())); }
    assert.equal(inserts.filter(result => result.status === 'fulfilled').length, 1, 'only one null-expiry identity insert may win');
    assert.equal(inserts.filter(result => result.status === 'rejected' && result.reason?.code === '23505').length, 1, 'duplicate null-expiry identity must fail uniquely');
    assert.equal(Number((await control.query("select count(*) count from product_batches where product_id=$1 and batch_number='SAME-NULL'", [ids.duplicateProduct])).rows[0].count), 1);
    process.stdout.write('PASS: optional-expiry checkout and identity concurrency are safe\n');
  } finally {
    await control.query('delete from transactions where cashier_id=$1', [ids.cashier]).catch(() => {});
    await control.query('delete from product_batches where product_id in ($1,$2)', [ids.product, ids.duplicateProduct]).catch(() => {});
    await control.query('delete from product_units where product_id=$1', [ids.product]).catch(() => {});
    await control.query('delete from products where id in ($1,$2)', [ids.product, ids.duplicateProduct]).catch(() => {});
    await control.query('delete from employees where id=$1', [ids.cashier]).catch(() => {});
    await control.query('delete from categories where id=$1', [ids.category]).catch(() => {});
    await control.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
