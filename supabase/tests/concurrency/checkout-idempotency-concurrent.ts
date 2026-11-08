#!/usr/bin/env node
/**
 * True concurrent session test for checkout_transaction_idempotent.
 * Spawns N parallel psql processes that all attempt checkout with the
 * SAME request_id. Verifies:
 *   - Exactly one transaction is created (not N)
 *   - All N sessions return the same transaction_id
 *   - Stock is deducted exactly once
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const DB = "postgresql://postgres:postgres@localhost:54322/postgres";
const CONCURRENCY = 6;
const REQUEST_ID = "dd000000-0000-4000-8000-000000000000";
const EMPLOYEE_ID = "dd000000-0000-4000-8000-000000000005";
const UNIT_ID = "dd000000-0000-4000-8000-000000000002";
const BATCH_ID = "dd000000-0000-4000-8000-000000000004";

const psql = (sql: string) =>
  exec("psql", [DB, "-t", "-A", "-c", sql]).then(({ stdout }) => stdout.trim());

async function setup() {
  await psql(`
    INSERT INTO products(id,sku,name,base_unit,unit_confirmed,classification_pending)
    VALUES('dd000000-0000-4000-8000-000000000001','CONC2','Concurrent session product','TAB',true,false)
    ON CONFLICT DO NOTHING;
    INSERT INTO product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
    VALUES('${UNIT_ID}','dd000000-0000-4000-8000-000000000001','TAB',1,1000,true)
    ON CONFLICT DO NOTHING;
    INSERT INTO product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
    VALUES('${BATCH_ID}','dd000000-0000-4000-8000-000000000001','LOT-CC','2035-01-01',10,500)
    ON CONFLICT DO NOTHING;
    INSERT INTO employees(id,full_name,position)
    VALUES('${EMPLOYEE_ID}','Concurrent Cashier','kasir')
    ON CONFLICT DO NOTHING;
  `);
}

async function cleanup() {
  await psql(`
    DELETE FROM checkout_requests WHERE request_id='${REQUEST_ID}';
    DELETE FROM transactions WHERE id IN (
      SELECT transaction_id FROM checkout_requests WHERE request_id='${REQUEST_ID}'
    );
    DELETE FROM product_batches WHERE id='${BATCH_ID}';
    DELETE FROM product_units WHERE id='${UNIT_ID}';
    DELETE FROM products WHERE id='dd000000-0000-4000-8000-000000000001';
    DELETE FROM employees WHERE id='${EMPLOYEE_ID}';
  `).catch(() => {}); // ignore cleanup errors
}

async function oneCheckout(): Promise<{ txId: string; error?: string }> {
  const sql = `
    SELECT checkout_transaction_idempotent(
      '${REQUEST_ID}'::uuid,
      '${EMPLOYEE_ID}',
      'cash',
      '[{"product_unit_id":"${UNIT_ID}","quantity":3}]',
      3000,
      '{"prescription_category":"bebas"}'
    )->>'transaction_id';
  `;
  try {
    const result = await psql(sql);
    return { txId: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { txId: "", error: msg };
  }
}

let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string, detail = "") {
  if (condition) {
    console.log(`  ✔ ${label}`);
    pass++;
  } else {
    console.error(`  ✘ ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

async function main() {
  console.log(`\n=== Concurrent checkout test (${CONCURRENCY} sessions, same request_id) ===\n`);

  await setup();

  // All sessions fire simultaneously
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => oneCheckout())
  );

  const errors = results.filter(r => r.error);
  const successes = results.filter(r => !r.error && r.txId);
  const txIds = new Set(successes.map(r => r.txId));

  assert(errors.length === 0,
    `all ${CONCURRENCY} sessions completed without error`,
    errors.map(e => e.error).join("; "));

  assert(txIds.size === 1,
    `all sessions returned the same transaction_id (got ${txIds.size} unique IDs)`,
    [...txIds].join(", "));

  assert(successes.length === CONCURRENCY,
    `all ${CONCURRENCY} sessions returned a transaction_id`);

  // DB invariants
  const txCount = await psql(
    `SELECT COUNT(*) FROM transactions WHERE id='${successes[0]?.txId || "none"}'::uuid;`
  );
  assert(txCount === "1",
    `exactly one transaction row in DB (got ${txCount})`);

  const reqCount = await psql(
    `SELECT COUNT(*) FROM checkout_requests WHERE request_id='${REQUEST_ID}';`
  );
  assert(reqCount === "1",
    `exactly one checkout_requests row (got ${reqCount})`);

  const batchQty = await psql(
    `SELECT quantity FROM product_batches WHERE id='${BATCH_ID}';`
  );
  assert(batchQty === "7",
    `stock deducted exactly once: 10 - 3 = 7 (got ${batchQty})`);

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);

  await cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
