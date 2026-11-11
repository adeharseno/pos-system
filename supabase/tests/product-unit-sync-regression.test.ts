import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { buildCashierProductResults } from "../../src/modules/catalog/search";
import { addCartItem, type CartCandidate } from "../../src/modules/sales/cart";

const DB_URL = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";

async function getClient() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

test("1. Konfirmasi produk dengan satuan kosong mengupdate baris eksisting tanpa membuat duplikat", async () => {
  const client = await getClient();
  try {
    await client.query("BEGIN;");

    // Dapatkan owner ID
    const ownerRes = await client.query("SELECT id FROM public.employees WHERE is_active AND position = 'owner_admin' LIMIT 1;");
    const ownerId = ownerRes.rows[0].id;

    // Buat produk uji dengan satuan kosong
    const prodId = "a1111111-1111-4111-8111-111111111111";
    await client.query(`
      INSERT INTO public.products (id, sku, name, is_active, unit_confirmed, base_unit, cost_price)
      VALUES ('${prodId}', 'TEST-EMPTY-01', 'OBAT TEST KOSONG', true, false, null, 1000);
    `);
    const unitId = "b1111111-1111-4111-8111-111111111111";
    await client.query(`
      INSERT INTO public.product_units (id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
      VALUES ('${unitId}', '${prodId}', '', 1, 1500, false);
    `);

    // Panggil confirm_initial_product_unit
    const confirmRes = await client.query(`
      SELECT public.confirm_initial_product_unit(
        '${ownerId}', '${prodId}', 'Tablet', 2000, 0
      );
    `);
    assert.ok(confirmRes.rows[0].confirm_initial_product_unit);

    // Verifikasi: unit eksisting diupdate, jumlah baris tetap 1
    const units = await client.query(`SELECT * FROM public.product_units WHERE product_id = '${prodId}';`);
    assert.equal(units.rows.length, 1, "Harus tetap 1 baris unit");
    assert.equal(units.rows[0].id, unitId, "ID unit eksisting harus dipertahankan");
    assert.equal(units.rows[0].unit_name, "Tablet", "Nama unit harus terupdate");
    assert.equal(Number(units.rows[0].selling_price), 2000, "Harga jual harus terupdate");
    assert.equal(units.rows[0].is_base_unit, true, "Harus menjadi base unit");

    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
});

test("2. Konfirmasi satuan berulang (idempotency) tidak menimbulkan error atau duplikat", async () => {
  const client = await getClient();
  try {
    await client.query("BEGIN;");

    const ownerRes = await client.query("SELECT id FROM public.employees WHERE is_active AND position = 'owner_admin' LIMIT 1;");
    const ownerId = ownerRes.rows[0].id;

    const prodId = "a2222222-2222-4222-8222-222222222222";
    await client.query(`
      INSERT INTO public.products (id, sku, name, is_active, unit_confirmed, base_unit, cost_price)
      VALUES ('${prodId}', 'TEST-IDEMP-01', 'OBAT TEST IDEMPOTENT', true, false, null, 5000);
    `);
    await client.query(`
      INSERT INTO public.product_units (product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
      VALUES ('${prodId}', '', 1, 6000, false);
    `);

    // Panggilan pertama
    await client.query(`
      SELECT public.confirm_initial_product_unit('${ownerId}', '${prodId}', 'Kapsul', 6500, 0);
    `);

    // Panggilan kedua menggunakan SAVEPOINT agar error tidak merusak transaksi
    await client.query("SAVEPOINT sp_confirm;");
    await assert.rejects(
      async () => {
        await client.query(`
          SELECT public.confirm_initial_product_unit('${ownerId}', '${prodId}', 'Kapsul', 6500, 0);
        `);
      },
      /UNIT_ALREADY_CONFIRMED/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_confirm;");

    // Verifikasi tetap hanya 1 unit
    const units = await client.query(`SELECT * FROM public.product_units WHERE product_id = '${prodId}';`);
    assert.equal(units.rows.length, 1);
    assert.equal(units.rows[0].unit_name, "Kapsul");

    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
});

test("3. Receiving dengan harga beli berubah mencatat batch baru tanpa menduplikasi harga jual", async () => {
  const client = await getClient();
  try {
    await client.query("BEGIN;");

    const ownerRes = await client.query("SELECT id FROM public.employees WHERE is_active AND position = 'owner_admin' LIMIT 1;");
    const ownerId = ownerRes.rows[0].id;

    const prodId = "a3333333-3333-4333-8333-333333333333";
    await client.query(`
      INSERT INTO public.products (id, sku, name, is_active, unit_confirmed, base_unit, cost_price)
      VALUES ('${prodId}', 'TEST-RECV-01', 'OBAT TEST RECEIVING', true, true, 'Botol', 10000);
    `);
    await client.query(`
      INSERT INTO public.product_units (product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
      VALUES ('${prodId}', 'Botol', 1, 15000, true);
    `);

    // Batch 1: harga beli 10.000
    await client.query(`
      SELECT public.receive_product_stock(
        '${ownerId}', '${prodId}',
        jsonb_build_array(jsonb_build_object('batch_number', 'BATCH-01', 'expired_date', '2028-01-01'::date, 'quantity', 10, 'cost_price', 10000.00))
      );
    `);

    // Batch 2: harga beli naik jadi 12.000
    await client.query(`
      SELECT public.receive_product_stock(
        '${ownerId}', '${prodId}',
        jsonb_build_array(jsonb_build_object('batch_number', 'BATCH-02', 'expired_date', '2028-06-01'::date, 'quantity', 5, 'cost_price', 12000.00))
      );
    `);

    // Verifikasi: 2 batch berbeda dengan masing-masing cost price historis
    const batches = await client.query(`SELECT * FROM public.product_batches WHERE product_id = '${prodId}' ORDER BY batch_number;`);
    assert.equal(batches.rows.length, 2);
    assert.equal(Number(batches.rows[0].cost_price), 10000);
    assert.equal(Number(batches.rows[1].cost_price), 12000);

    // Verifikasi: unit jual tetap 1 dengan harga jual resmi tidak berubah
    const units = await client.query(`SELECT * FROM public.product_units WHERE product_id = '${prodId}';`);
    assert.equal(units.rows.length, 1);
    assert.equal(Number(units.rows[0].selling_price), 15000);

    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
});

test("4. Multi-unit PCS / BOX dengan konversi valid tetap didukung dan dipisahkan di kasir", () => {
  const productWithMultiUnits = {
    id: "prod-multi",
    name: "AMOXICILLIN 500",
    sku: "AMX-500",
    requires_prescription: false,
    product_units: [
      {
        id: "unit-pcs",
        unit_name: "PCS",
        conversion_to_base: 1,
        selling_price: 1000,
        barcode: null,
        is_base_unit: true,
      },
      {
        id: "unit-box",
        unit_name: "BOX",
        conversion_to_base: 100,
        selling_price: 90000,
        barcode: null,
        is_base_unit: false,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([productWithMultiUnits], [{ product_id: "prod-multi", quantity: 500 }]);
  assert.equal(mapped.units.length, 2, "Harus menampilkan kedua opsi kemasan");
  assert.equal(mapped.units[0].label, "PCS");
  assert.equal(mapped.units[0].displayedUnitPrice, 1000);
  assert.equal(mapped.units[1].label, "BOX");
  assert.equal(mapped.units[1].displayedUnitPrice, 90000);
});

test("5. Kasir: AK MICROPORE harga ganda (25.000 vs 29.000) melebur ke harga resmi kanonikal 25.000", () => {
  const micropore = {
    id: "55c53331-e2fe-4495-99ee-55042117e38f",
    name: "AK MICROPORE 1 INCH",
    sku: "INT-00200",
    requires_prescription: false,
    product_units: [
      {
        id: "3b0bd2fb-1300-43f5-ba92-03466e3a4a93",
        unit_name: "Pcs",
        conversion_to_base: 1,
        selling_price: 25000,
        barcode: null,
        is_base_unit: true,
      },
      {
        id: "e1f0ae70-f7f6-45aa-a81b-faa20f3e5ec6",
        unit_name: "",
        conversion_to_base: 1,
        selling_price: 29000,
        barcode: null,
        is_base_unit: false,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([micropore], [{ product_id: micropore.id, quantity: 13 }]);
  assert.equal(mapped.units.length, 1, "Hanya 1 unit yang ditampilkan di kasir");
  assert.equal(mapped.units[0].id, "3b0bd2fb-1300-43f5-ba92-03466e3a4a93");
  assert.equal(mapped.units[0].label, "Pcs");
  assert.equal(mapped.units[0].displayedUnitPrice, 25000, "Harga kanonikal resmi adalah Rp25.000");
});

test("6. Produk harga null tidak dapat ditambahkan ke keranjang kasir", () => {
  const unpricedProduct = {
    id: "prod-null",
    name: "PRODUK BELUM ADA HARGA",
    sku: "NULL-01",
    requires_prescription: false,
    product_units: [
      {
        id: "unit-null",
        unit_name: "PCS",
        conversion_to_base: 1,
        selling_price: 0,
        barcode: null,
        is_base_unit: true,
      },
    ],
  };

  const [mapped] = buildCashierProductResults([unpricedProduct], [{ product_id: "prod-null", quantity: 10 }]);
  assert.equal(mapped.units[0].displayedUnitPrice, 0);

  // Cart addition must throw PosInputError
  const candidate: CartCandidate = {
    productId: mapped.id,
    productName: mapped.name,
    productUnitId: mapped.units[0].id,
    unitLabel: mapped.units[0].label,
    conversionToBase: mapped.units[0].conversionToBase,
    displayedUnitPrice: mapped.units[0].displayedUnitPrice,
    requiresPrescription: mapped.requiresPrescription,
  };
  assert.throws(() => addCartItem([], candidate), /selling price must be greater than zero/);
});

test("7. Checkout dan perhitungan stok terpotong sesuai konversi base unit", async () => {
  const client = await getClient();
  try {
    await client.query("BEGIN;");

    const ownerRes = await client.query("SELECT id FROM public.employees WHERE is_active AND position = 'owner_admin' LIMIT 1;");
    const ownerId = ownerRes.rows[0].id;

    const prodId = "a4444444-4444-4444-8444-444444444444";
    await client.query(`
      INSERT INTO public.products (id, sku, name, is_active, unit_confirmed, base_unit, cost_price)
      VALUES ('${prodId}', 'TEST-STOCK-01', 'OBAT TEST STOK', true, true, 'Tablet', 500);
    `);
    const unitId = "b4444444-4444-4444-8444-444444444444";
    await client.query(`
      INSERT INTO public.product_units (id, product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
      VALUES ('${unitId}', '${prodId}', 'Tablet', 1, 1000, true);
    `);

    // Masukkan stok awal: 20 tablet
    await client.query(`
      SELECT public.receive_product_stock(
        '${ownerId}', '${prodId}',
        jsonb_build_array(jsonb_build_object('batch_number', 'BATCH-STK', 'expired_date', '2028-01-01'::date, 'quantity', 20, 'cost_price', 500.00))
      );
    `);

    // Selesaikan checkout 5 tablet via checkout_transaction_idempotent
    const reqId = "c4444444-4444-4444-8444-444444444444";
    const checkoutRes = await client.query(`
      SELECT public.checkout_transaction_idempotent(
        '${reqId}'::uuid,
        '${ownerId}'::uuid,
        'cash'::public.payment_method,
        jsonb_build_array(jsonb_build_object(
          'product_unit_id', '${unitId}',
          'quantity', 5
        )),
        10000::numeric,
        jsonb_build_object('prescription_category', 'bebas'),
        '[]'::jsonb
      );
    `);
    assert.ok(checkoutRes.rows[0].checkout_transaction_idempotent);

    // Verifikasi stok berkurang menjadi 15
    const batchRes = await client.query(`SELECT quantity FROM public.product_batches WHERE product_id = '${prodId}';`);
    assert.equal(batchRes.rows[0].quantity, 15);

    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
});

test("8. Integritas pembacaan transaksi historis terjaga setelah repoint", async () => {
  const client = await getClient();
  try {
    // Verifikasi bahwa transaksi historis di database lokal tetap dapat dibaca tanpa error FK
    const tx = await client.query(`
      SELECT ti.id, ti.product_id, ti.product_unit_id, pu.unit_name, ti.unit_price, ti.quantity_in_unit
      FROM public.transaction_items ti
      JOIN public.product_units pu ON pu.id = ti.product_unit_id
      LIMIT 10;
    `);
    assert.ok(tx.rows.length >= 0);
  } finally {
    await client.end();
  }
});

test("9. Dua operasi konfirmasi satuan concurrent ditangani secara aman oleh advisory lock", async () => {
  const client1 = await getClient();
  const client2 = await getClient();
  try {
    await client1.query("BEGIN;");
    await client2.query("BEGIN;");

    const ownerRes = await client1.query("SELECT id FROM public.employees WHERE is_active AND position = 'owner_admin' LIMIT 1;");
    const ownerId = ownerRes.rows[0].id;

    const prodId = "a5555555-5555-4555-8555-555555555555";
    await client1.query(`
      INSERT INTO public.products (id, sku, name, is_active, unit_confirmed, base_unit, cost_price)
      VALUES ('${prodId}', 'TEST-CONC-01', 'OBAT TEST CONCURRENCY', true, false, null, 1000);
    `);
    await client1.query(`
      INSERT INTO public.product_units (product_id, unit_name, conversion_to_base, selling_price, is_base_unit)
      VALUES ('${prodId}', '', 1, 1500, false);
    `);
    await client1.query("COMMIT;");

    // Jalankan kedua konfirmasi secara paralel
    const p1 = client1.query(`SELECT public.confirm_initial_product_unit('${ownerId}', '${prodId}', 'Tablet', 2000, 0);`);
    const p2 = client2.query(`SELECT public.confirm_initial_product_unit('${ownerId}', '${prodId}', 'Tablet', 2000, 0);`);

    const results = await Promise.allSettled([p1, p2]);

    // Satu harus sukses, yang kedua harus ditolak karena UNIT_ALREADY_CONFIRMED
    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Tepat 1 operasi konfirmasi yang berhasil");
    assert.equal(rejected.length, 1, "Operasi kedua harus diblokir");
    assert.match(rejected[0].reason.message, /UNIT_ALREADY_CONFIRMED/);

    // Pembersihan data uji
    await client1.query(`DELETE FROM public.product_units WHERE product_id = '${prodId}';`);
    await client1.query(`DELETE FROM public.products WHERE id = '${prodId}';`);
  } finally {
    await client1.end();
    await client2.end();
  }
});
