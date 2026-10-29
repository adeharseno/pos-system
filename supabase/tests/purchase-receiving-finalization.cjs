/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable schema-only local database: never cancels or modifies existing local opname sessions.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');
const database = `invoice_receiving_test_${randomUUID().replaceAll('-', '')}`;
assert.match(database, /^invoice_receiving_test_[a-f0-9]{32}$/);
const config = { host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres' };
const admin = new Client({ ...config, database: 'postgres' });
const clients = [];
const connect = async () => { const c = new Client({ ...config, database }); await c.connect(); clients.push(c); return c; };
const owner = randomUUID(), cashier = randomUUID(), supplier = randomUUID(), category = randomUUID(), subcategory = randomUUID();
const product = randomUUID(), master = randomUUID(), rollbackMaster = randomUUID(), baseUnit = randomUUID(), stripUnit = randomUUID();
let c;
async function makeInvoice(lines, total = '100') {
  const id = randomUUID();
  await c.query(`insert into purchase_invoices(id,supplier_id,invoice_number,invoice_date,total_amount,created_by,updated_by) values($1,$2,$3,current_date,$4,$5,$5)`, [id,supplier,randomUUID(),total,owner]);
  for (const patch of lines) {
    const payload = { product_id: product, product_unit_id: baseUnit, cost_price: '100.00', tax_rate: '0', selling_price: '150.00', pricing_mode: 'selling_price', quantity: '2', batch_number: `B-${randomUUID()}`, expired_date: '2035-01-01', ...patch };
    await c.query('select write_purchase_invoice_item($1,$2,$3,$4,null,$5,$6)', [id,randomUUID(),randomUUID(),owner,'create',payload]);
  }
  return id;
}
const preview = async id => (await c.query('select preview_purchase_receiving($1,$2) p', [id,owner])).rows[0].p;
const finish = (client,id,plan,key=randomUUID(),ack=true,actor=owner) => client.query('select finalize_purchase_receiving($1,$2,$3,$4,$5,$6) result', [id,actor,key,plan.version,plan.token,ack]);
const expectCode = async (fn,code) => assert.rejects(fn, error => error.message === code);
const state = async () => (await c.query(`select
  (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from products p) products,
  (select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') from product_units u) units,
  (select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from product_batches b) batches,
  (select coalesce(jsonb_agg(to_jsonb(r) order by item_id),'[]') from purchase_invoice_receipts r) receipts`)).rows[0];
async function waitForBlock(blockerPid) {
  for (let n=0;n<100;n++) {
    const count = (await c.query('select count(*)::int n from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))',[blockerPid])).rows[0].n;
    if (count) return;
    await new Promise(resolve => setTimeout(resolve,20));
  }
  throw new Error('Expected a row-lock waiter');
}
(async () => {
  await admin.connect();
  try {
    await admin.query(`create database "${database}"`);
    const schema = execFileSync('docker',['exec','supabase_db_pos-system','pg_dump','-U','postgres','--schema-only','--no-owner','--no-privileges','--schema=public','postgres'],{encoding:'utf8'}).replace('CREATE SCHEMA public;','');
    const prep = "create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.objects(bucket_id text,name text); create schema extensions; create extension pgtap with schema extensions; create extension pg_trgm with schema public;\n";
    execFileSync('docker',['exec','-i','supabase_db_pos-system','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:prep+schema,encoding:'utf8',stdio:['pipe','pipe','pipe']});
    c = await connect();
    await c.query(`insert into employees(id,full_name,position) values($1,'Receiving owner','owner_admin'),($2,'Receiving cashier','kasir')`,[owner,cashier]);
    await c.query('insert into suppliers(id,name) values($1,$2)',[supplier,'Receiving supplier']);
    await c.query('insert into categories(id,name) values($1,$2)',[category,'Receiving category']);
    await c.query('insert into subcategories(id,category_id,name) values($1,$2,$3)',[subcategory,category,'Receiving subcategory']);
    await c.query(`insert into products(id,sku,name,base_unit,category_id,subcategory_id,cost_price) values($1,'PRICED','Priced product','Tablet',$3,$4,100),($2,'MASTER','Master only','Botol',$3,$4,null)`,[product,master,category,subcategory]);
    await c.query(`insert into products(id,sku,name,base_unit,category_id,subcategory_id,cost_price) values($1,'ROLLBACK-MASTER','Rollback master','Botol',$2,$3,null)`,[rollbackMaster,category,subcategory]);
    await c.query(`insert into product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit) values($1,$2,'Tablet',1,150,true),($3,$2,'Strip',10,1500,false)`,[baseUnit,product,stripUnit]);
    await c.query(`insert into product_batches(product_id,batch_number,expired_date,quantity,cost_price) values($1,'EXISTING','2035-01-01',6,100)`,[product]);
    const drawer=(await c.query('select open_cash_drawer($1,0) d',[owner])).rows[0].d.session_id;
    await c.query("select checkout_transaction($1,$2,'cash',$3,150,null)",[owner,drawer,JSON.stringify([{product_unit_id:baseUnit,quantity:1}])]);
    const saleSnapshot=async()=>(await c.query(`select
      (select jsonb_agg(to_jsonb(t) order by id) from transactions t) transactions,
      (select jsonb_agg(to_jsonb(i) order by id) from transaction_items i) items,
      (select jsonb_agg(to_jsonb(b) order by id) from transaction_item_batches b) allocations`)).rows[0];
    const salesBefore = await saleSnapshot(); assert.equal(salesBefore.transactions.length,1);

    const normal = await makeInvoice([
      { product_unit_id: stripUnit, cost_price:'1200', selling_price:'1800', quantity:'3',batch_number:'NEW-STRIP' },
      { product_unit_id: baseUnit, cost_price:'200', selling_price:'300',quantity:'2',batch_number:'EXISTING' },
      { product_id:master,product_unit_id:null,cost_price:'250',selling_price:'400',quantity:'4',batch_number:'MASTER-BATCH' }
    ]);
    const plan = await preview(normal); assert.equal(plan.item_count,3); assert.equal(plan.purchase_total,'5000.00');
    await expectCode(() => finish(c,normal,plan,randomUUID(),false),'INVOICE_DIFFERENCE_NOT_CONFIRMED');
    await expectCode(() => finish(c,normal,plan,randomUUID(),true,cashier),'FORBIDDEN');
    await c.query(`insert into stock_opname_sessions(created_by) values($1)`,[owner]);
    const blockedState = await state();
    await expectCode(() => finish(c,normal,plan),'STOCK_OPNAME_IN_PROGRESS'); assert.deepEqual(await state(),blockedState);
    await c.query('delete from stock_opname_sessions');
    const c2 = await connect(), key = randomUUID();
    const results = await Promise.all([finish(c,normal,plan,key),finish(c2,normal,plan,key)]);
    assert.deepEqual(results.map(r=>r.rows[0].result.replayed).sort(),[false,true]);
    let batches = (await c.query('select * from product_batches')).rows;
    assert.equal(batches.find(b=>b.batch_number==='NEW-STRIP').quantity,30); assert.equal(batches.find(b=>b.batch_number==='NEW-STRIP').cost_price,'120.00');
    assert.equal(batches.find(b=>b.batch_number==='EXISTING').quantity,7); assert.equal(batches.find(b=>b.batch_number==='EXISTING').cost_price,'128.57');
    const created = (await c.query('select * from product_units where product_id=$1',[master])).rows;
    assert.equal(created.length,1); assert.equal(created[0].selling_price,'400.00'); assert.equal(created[0].conversion_to_base,1); assert.equal(created[0].is_base_unit,true);
    const completed = (await c.query('select * from purchase_invoices where id=$1',[normal])).rows[0];
    assert.equal(completed.status,'completed'); assert.equal(completed.version,2);
    assert.equal((await c.query('select count(*)::int n from purchase_invoice_receipts where invoice_id=$1',[normal])).rows[0].n,3);
    const stable = await state(); await finish(c,normal,plan,key); assert.deepEqual(await state(),stable,'retry cannot replay prices or stock');
    await expectCode(() => finish(c,normal,plan),'INVOICE_ALREADY_COMPLETED');
    const item = (await c.query('select * from purchase_invoice_items where invoice_id=$1 limit 1',[normal])).rows[0];
    await expectCode(()=>c.query('select write_purchase_invoice_item($1,$2,$3,$4,$5,$6,$7)',[normal,item.id,randomUUID(),owner,item.version,'delete',{}]),'INVOICE_NOT_DRAFT');
    await expectCode(()=>c.query('select save_purchase_invoice_draft($1,$2,$3,$4,$5)',[normal,randomUUID(),owner,2,{}]),'INVOICE_NOT_DRAFT');

    // Repeated product/batch rows merge into one stock batch, each source item remains traceable.
    const merge = await makeInvoice([{batch_number:'MERGE',cost_price:'100',quantity:'2'},{batch_number:'MERGE',cost_price:'200',quantity:'3'}],'800');
    const mergePlan = await preview(merge); const r1=finish(c,merge,mergePlan),r2=finish(c2,merge,mergePlan);
    const raced = await Promise.allSettled([r1,r2]); assert.equal(raced.filter(r=>r.status==='fulfilled').length,1); assert.equal(raced.find(r=>r.status==='rejected').reason.message,'INVOICE_ALREADY_COMPLETED');
    const merged = (await c.query("select * from product_batches where batch_number='MERGE'")).rows[0]; assert.equal(merged.quantity,5); assert.equal(merged.cost_price,'160.00');

    // A stale confirmation after manual price or item edits must not write anything.
    const stale = await makeInvoice([{batch_number:'STALE'}]); const stalePlan=await preview(stale);
    await c.query('update product_units set selling_price=333 where id=$1',[baseUnit]); const staleState=await state();
    await expectCode(()=>finish(c,stale,stalePlan),'INVOICE_RECEIVING_CHANGED'); assert.deepEqual(await state(),staleState);
    const itemStale=(await c.query('select * from purchase_invoice_items where invoice_id=$1',[stale])).rows[0];
    const itemPlan=await preview(stale);
    await c.query('select write_purchase_invoice_item($1,$2,$3,$4,1,$5,$6)',[stale,itemStale.id,randomUUID(),owner,'update',{product_id:product,product_unit_id:baseUnit,cost_price:'100',tax_rate:'0',selling_price:'150',pricing_mode:'selling_price',quantity:'3',batch_number:'STALE',expired_date:'2035-01-01'}]);
    await expectCode(()=>finish(c,stale,itemPlan),'INVOICE_RECEIVING_CHANGED');

    // Manual edit waiting behind finalization commits last and wins the cashier price.
    const held = await makeInvoice([{batch_number:'HELD',selling_price:'444'}]); const heldPlan=await preview(held);
    await c2.query('begin'); await finish(c2,held,heldPlan); const pid=(await c2.query('select pg_backend_pid() pid')).rows[0].pid;
    const c3=await connect(); const manual = c3.query('update product_units set selling_price=555 where id=$1',[baseUnit]);
    await waitForBlock(pid); await c2.query('commit'); await manual;
    assert.equal((await c.query('select selling_price from product_units where id=$1',[baseUnit])).rows[0].selling_price,'555.00');
    const replayPlan=heldPlan, heldKey=(await c.query("select request_id from purchase_invoice_requests where invoice_id=$1 and payload->>'kind'='finalize'",[held])).rows[0].request_id;
    await finish(c,held,replayPlan,heldKey); assert.equal((await c.query('select selling_price from product_units where id=$1',[baseUnit])).rows[0].selling_price,'555.00','retry never overwrites a later manual edit');

    // A manual edit holding the row first invalidates the older dialog after it commits.
    const waiting = await makeInvoice([{batch_number:'WAITING',selling_price:'666'}]); const waitingPlan=await preview(waiting);
    await c3.query('begin'); await c3.query('update product_units set selling_price=777 where id=$1',[baseUnit]);
    const manualPid=(await c3.query('select pg_backend_pid() pid')).rows[0].pid;
    const waitingCall=finish(c2,waiting,waitingPlan).then(()=>null,error=>error);
    await waitForBlock(manualPid); await c3.query('commit'); assert.equal((await waitingCall).message,'INVOICE_RECEIVING_CHANGED');
    assert.equal((await c.query("select count(*)::int n from product_batches where batch_number='WAITING'")).rows[0].n,0);
    await finish(c,waiting,await preview(waiting)); assert.equal((await c.query('select selling_price from product_units where id=$1',[baseUnit])).rows[0].selling_price,'666.00');

    // Force failure after batches and product prices have been written: every mutation rolls back.
    const rollback = await makeInvoice([{batch_number:'ROLLBACK-FIRST'},{product_id:rollbackMaster,product_unit_id:null,cost_price:'250',selling_price:'401',batch_number:'ROLLBACK-SECOND'}]);
    const rollbackPlan=await preview(rollback); const beforeRollback=await state();
    await c.query(`create function fail_receipt_fixture() returns trigger language plpgsql as $$begin if new.invoice_id='${rollback}'::uuid and new.product_id='${rollbackMaster}'::uuid then raise exception 'RECEIPT_FIXTURE_FAILURE'; end if; return new; end$$; create trigger fail_receipt_fixture before insert on purchase_invoice_receipts for each row execute function fail_receipt_fixture()`);
    await expectCode(()=>finish(c,rollback,rollbackPlan),'RECEIPT_FIXTURE_FAILURE'); assert.deepEqual(await state(),beforeRollback,'no partial stock, unit, price or receipt mutation');
    assert.equal((await c.query('select status from purchase_invoices where id=$1',[rollback])).rows[0].status,'draft');
    await c.query('drop trigger fail_receipt_fixture on purchase_invoice_receipts; drop function fail_receipt_fixture()');
    const bad = await makeInvoice([{batch_number:'EXPIRED'}]); await c.query("update purchase_invoice_items set expired_date='2000-01-01' where invoice_id=$1",[bad]);
    await expectCode(()=>preview(bad),'INVALID_RECEIVING_ITEM');
    assert.deepEqual(await saleSnapshot(),salesBefore,'historical sales, prices and batch-cost snapshots remain unchanged');
    const legacy=execFileSync('docker',['exec','-i','supabase_db_pos-system','psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{input:readFileSync('supabase/tests/database/stock_receiving.test.sql','utf8'),encoding:'utf8',stdio:['pipe','pipe','pipe']});
    assert.ok(!/not ok \d|Looks like you failed/.test(legacy),legacy);
    console.log('PASS: normal/multiple batches, existing batch weighted cost, base conversion, master unit creation, mismatch, opname, permission, read-only, retry, concurrency, last committed manual price, rollback after partial writes, expiry, unchanged sales');
    console.log('PASS: existing stock_receiving.test.sql (12 assertions) in disposable database');
  } finally {
    for (const client of clients) { try { await client.query('rollback'); } catch {} await client.end(); }
    await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',[database]);
    await admin.query(`drop database if exists "${database}"`); await admin.end();
  }
})().catch(error=>{ console.error(error.stderr?.toString().slice(0,2000)||error); process.exitCode=1; });
