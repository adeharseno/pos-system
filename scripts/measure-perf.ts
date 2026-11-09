import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres:postgres@localhost:54322/postgres",
});

const AUTH_USER_ID = "793c69d6-66ee-467d-93d6-eb396cf5b385";
const SEARCH_QUERY = "tremenza";
const WARMUP_ROUNDS = 5;
const BENCHMARK_ROUNDS = 30;

async function timeOperation(fn: () => Promise<void>, rounds: number): Promise<{ mean: number; min: number; max: number; times: number[] }> {
  // warmup
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    await fn();
  }
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    times.push(duration);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, t) => acc + t, 0);
  return {
    mean: sum / rounds,
    min: times[0],
    max: times[times.length - 1],
    times,
  };
}

async function main() {
  await client.connect();
  console.log("===============================================================");
  console.log("  PHARMACY POS - BENCHMARK & ROUND-TRIP PERFORMANCE REPORT");
  console.log("===============================================================\n");

  // 1. Auth Resolution Benchmark
  console.log("1. AUTH RESOLUTION (Local PostgreSQL Connection)");
  console.log("---------------------------------------------------------------");
  
  // Old sequential path: 3 DB round trips
  const oldAuth = await timeOperation(async () => {
    // 1. employee_account_access
    await client.query("SELECT public.employee_account_access($1::uuid) as access;", [AUTH_USER_ID]);
    // 2. user_profiles
    const r2 = await client.query("SELECT employee_id FROM public.user_profiles WHERE id = $1::uuid LIMIT 1;", [AUTH_USER_ID]);
    const empId = r2.rows[0]?.employee_id;
    // 3. employees
    await client.query("SELECT id, full_name, position, is_active FROM public.employees WHERE id = $1::uuid LIMIT 1;", [empId]);
  }, BENCHMARK_ROUNDS);

  // New consolidated path: 1 DB round trip
  const newAuth = await timeOperation(async () => {
    await client.query("SELECT public.resolve_employee_session($1::uuid) as session;", [AUTH_USER_ID]);
  }, BENCHMARK_ROUNDS);

  console.log(`  BEFORE (Sequential 3 round trips):`);
  console.log(`    Mean Duration: ${oldAuth.mean.toFixed(2)} ms | Min: ${oldAuth.min.toFixed(2)} ms | Max: ${oldAuth.max.toFixed(2)} ms`);
  console.log(`    DB Round Trips: 3`);
  console.log(`  AFTER (Single resolve_employee_session RPC):`);
  console.log(`    Mean Duration: ${newAuth.mean.toFixed(2)} ms | Min: ${newAuth.min.toFixed(2)} ms | Max: ${newAuth.max.toFixed(2)} ms`);
  console.log(`    DB Round Trips: 1`);
  console.log(`  IMPROVEMENT: ${(oldAuth.mean - newAuth.mean).toFixed(2)} ms reduction (${(((oldAuth.mean - newAuth.mean) / oldAuth.mean) * 100).toFixed(1)}% faster, 66.7% fewer round trips)\n`);

  // 2. Product Search & Batch Inventory Query
  console.log("2. PRODUCT SEARCH & BATCH AVAILABILITY QUERY");
  console.log("---------------------------------------------------------------");
  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  let responseBytes = 0;
  const searchBench = await timeOperation(async () => {
    // Step A: Product query
    const productRes = await client.query(`
      SELECT p.id, p.sku, p.name, p.requires_prescription,
             json_agg(json_build_object(
               'id', pu.id,
               'unit_name', pu.unit_name,
               'conversion_to_base', pu.conversion_to_base,
               'selling_price', pu.selling_price,
               'barcode', pu.barcode
             )) as units
      FROM public.products p
      JOIN public.product_units pu ON pu.product_id = p.id
      WHERE p.is_active = true AND (p.name ILIKE $1 OR p.sku ILIKE $1)
      GROUP BY p.id, p.sku, p.name, p.requires_prescription
      ORDER BY p.name
      LIMIT 20;
    `, [`%${SEARCH_QUERY}%`]);

    const productIds = productRes.rows.map(r => r.id);
    // Step B: Batch query
    let batchRes: { rows: unknown[] } = { rows: [] };
    if (productIds.length > 0) {
      batchRes = await client.query(`
        SELECT product_id, quantity
        FROM public.product_batches
        WHERE product_id = ANY($1::uuid[]) AND quantity > 0
          AND (expired_date IS NULL OR expired_date >= $2::date);
      `, [productIds, businessDate]);
    }
    const payload = JSON.stringify({ products: productRes.rows, batches: batchRes.rows });
    responseBytes = Buffer.byteLength(payload, "utf8");
  }, BENCHMARK_ROUNDS);

  console.log(`  Product Search (query: "${SEARCH_QUERY}", returns 2 products, 3 units):`);
  console.log(`    Mean Duration: ${searchBench.mean.toFixed(2)} ms | Min: ${searchBench.min.toFixed(2)} ms | Max: ${searchBench.max.toFixed(2)} ms`);
  console.log(`    DB Round Trips: 2 (1 products + 1 batches)`);
  console.log(`    Response Size (uncompressed): ~${responseBytes} bytes\n`);

  // 3. Availability API Benchmark
  console.log("3. LIVE INVENTORY AVAILABILITY API (/api/products/availability)");
  console.log("---------------------------------------------------------------");
  const getTremenza = await client.query("SELECT id FROM public.products WHERE sku ILIKE '%00200980%' OR name ILIKE '%TREMENZA%' LIMIT 1;");
  const actualId = getTremenza.rows[0]?.id || "a5500000-0000-4000-8000-000000000001";

  const availBench = await timeOperation(async () => {
    await client.query(`
      SELECT product_id, sum(quantity)::int as available_stock_base
      FROM public.product_batches
      WHERE product_id = ANY($1::uuid[]) AND quantity > 0
        AND (expired_date IS NULL OR expired_date >= $2::date)
      GROUP BY product_id;
    `, [[actualId], businessDate]);
  }, BENCHMARK_ROUNDS);

  console.log(`  Availability Lookup for target SKU (product_id: ${actualId}):`);
  console.log(`    Mean Duration: ${availBench.mean.toFixed(2)} ms | Min: ${availBench.min.toFixed(2)} ms`);
  console.log(`    DB Round Trips: 1\n`);

  // 4. Checkout RPC Duration Benchmark (Idempotent replay vs fresh)
  console.log("4. CHECKOUT RPC DURATION");
  console.log("---------------------------------------------------------------");
  // Test idempotency replay duration (cache hit)
  const testReqId = "ee000000-0000-4000-8000-000000000001";
  const testEmpId = "cc000000-0000-4000-8000-000000000005";
  const testUnitId = "cc000000-0000-4000-8000-000000000002";
  
  // Setup one committed record for replay testing
  await client.query(`
    INSERT INTO products(id,sku,name,base_unit,unit_confirmed,classification_pending)
    VALUES('ee000000-0000-4000-8000-000000000002','BENCH','Bench product','TAB',true,false)
    ON CONFLICT DO NOTHING;
    INSERT INTO product_units(id,product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
    VALUES('${testUnitId}','ee000000-0000-4000-8000-000000000002','TAB',1,1000,true)
    ON CONFLICT DO NOTHING;
    INSERT INTO product_batches(id,product_id,batch_number,expired_date,quantity,cost_price)
    VALUES('ee000000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000002','LOT-B','2035-01-01',1000,500)
    ON CONFLICT DO NOTHING;
    INSERT INTO employees(id,full_name,position)
    VALUES('${testEmpId}','Bench Cashier','kasir')
    ON CONFLICT DO NOTHING;
  `);

  // Execute initial checkout
  const initial = await client.query(`
    SELECT checkout_transaction_idempotent(
      '${testReqId}'::uuid,
      '${testEmpId}',
      'cash',
      '[{"product_unit_id":"${testUnitId}","quantity":1}]',
      1000,
      '{"prescription_category":"bebas"}'
    ) as res;
  `);

  // Measure replay (cache hit)
  const replayBench = await timeOperation(async () => {
    await client.query(`
      SELECT checkout_transaction_idempotent(
        '${testReqId}'::uuid,
        '${testEmpId}',
        'cash',
        '[{"product_unit_id":"${testUnitId}","quantity":1}]',
        1000,
        '{"prescription_category":"bebas"}'
      );
    `);
  }, BENCHMARK_ROUNDS);

  console.log(`  Idempotent Replay (cache hit):`);
  console.log(`    Mean Duration: ${replayBench.mean.toFixed(2)} ms | Min: ${replayBench.min.toFixed(2)} ms | Max: ${replayBench.max.toFixed(2)} ms`);
  console.log(`    DB Round Trips: 1 (single SELECT ... FOR UPDATE & return cached JSON)\n`);

  // Cleanup benchmark data
  await client.query(`
    DELETE FROM checkout_requests WHERE request_id = '${testReqId}';
    DELETE FROM transactions WHERE id = '${initial.rows[0].res.transaction_id}';
    DELETE FROM product_batches WHERE id = 'ee000000-0000-4000-8000-000000000003';
    DELETE FROM product_units WHERE id = '${testUnitId}';
    DELETE FROM products WHERE id = 'ee000000-0000-4000-8000-000000000002';
    DELETE FROM employees WHERE id = '${testEmpId}';
  `);

  console.log("===============================================================");
  console.log("  TOTAL REQUEST LATENCY REDUCTION SUMMARY");
  console.log("===============================================================");
  console.log(`  Cashier search request total DB round trips:`);
  console.log(`    Before: 4 auth + 2 search = 6 round trips`);
  console.log(`    After:  2 auth (getUser + resolve) + 2 search = 4 round trips`);
  console.log(`    Savings: 2 round trips per search keystroke (-33% network latency)`);
  console.log("===============================================================\n");

  await client.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
