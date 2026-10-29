/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');
const owner = randomUUID(), supplier = randomUUID(), invoice = randomUUID();
async function client() { const value = new Client({ connectionString }); await value.connect(); return value; }
(async()=>{
  const setup=await client(), first=await client(), second=await client();
  try {
    await setup.query('insert into employees(id,full_name,position) values($1,$2,$3)',[owner,'Concurrent payment owner','owner_admin']);
    await setup.query('insert into suppliers(id,name) values($1,$2)',[supplier,'Concurrent payment supplier']);
    await setup.query('insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by) values($1,$2,$3,current_date,100,$4,$4)',[invoice,supplier,`PAY-${invoice}`,owner]);
    const before=(await setup.query("select (select md5(coalesce(string_agg(row_to_json(p)::text,',' order by id),'')) from products p) products,(select md5(coalesce(string_agg(row_to_json(u)::text,',' order by id),'')) from product_units u) units,(select md5(coalesce(string_agg(row_to_json(b)::text,',' order by id),'')) from product_batches b) batches")).rows[0];
    const call=(db)=>db.query('select record_purchase_invoice_payment($1,$2,$3,60,current_date)',[invoice,randomUUID(),owner]);
    const results=await Promise.allSettled([call(first),call(second)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(results.filter(row=>row.status==='rejected'&&row.reason?.message==='INVOICE_PAYMENT_EXCEEDS_BALANCE').length,1);
    assert.equal(Number((await setup.query('select sum(amount) total from purchase_invoice_payments where invoice_id=$1',[invoice])).rows[0].total),60);
    const after=(await setup.query("select (select md5(coalesce(string_agg(row_to_json(p)::text,',' order by id),'')) from products p) products,(select md5(coalesce(string_agg(row_to_json(u)::text,',' order by id),'')) from product_units u) units,(select md5(coalesce(string_agg(row_to_json(b)::text,',' order by id),'')) from product_batches b) batches")).rows[0];
    assert.deepEqual(after,before);
    console.log('PASS: concurrent supplier payments cannot overpay or change stock/prices');
  } finally {
    await setup.query('delete from purchase_invoice_requests where invoice_id=$1',[invoice]);
    await setup.query('delete from purchase_invoice_payments where invoice_id=$1',[invoice]);
    await setup.query('delete from purchase_invoices where id=$1',[invoice]);
    await setup.query('delete from suppliers where id=$1',[supplier]);
    await setup.query('delete from employees where id=$1',[owner]);
    await Promise.all([first.end(),second.end(),setup.end()]);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
