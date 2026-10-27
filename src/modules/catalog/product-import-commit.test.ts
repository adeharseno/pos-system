import assert from "node:assert/strict";
import test from "node:test";
import { commitProductImportWith, type ProductImportCommitRow, type ProductImportDependencies } from "./application/product-import-commit";
import { submitProductImportBatches } from "./import-batches";
import type { CreateProductInput } from "./application/create-product";

const category = "11111111-1111-4111-8111-111111111111", subcategory = "22222222-2222-4222-8222-222222222222";
const rows = (count: number): ProductImportCommitRow[] => Array.from({ length: count }, (_, index) => ({ rowNumber: index + 2, sku: `SKU-${index}`, name: `Barang ${index}`, genericName: "", manufacturer: "", baseUnit: "Tablet", sellingPrice: 12000, costPrice: 10000, barcode: "", drugClassification: "otc", minimumStock: 0, isActive: false, categoryId: category, subcategoryId: subcategory, defaultSupplierId: null, storageLocationId: null }));

// Test dependencies only: production always uses the existing RPC-backed createProduct.
function dependencies() {
  const saved = new Map<string, CreateProductInput>();
  let active = 0, maximum = 0;
  const deps: ProductImportDependencies = {
    master: async () => ({ categories: [{ id: category, name: "Obat" }], subcategories: [{ id: subcategory, category_id: category, name: "Tablet" }], suppliers: [], locations: [] }),
    existing: async skus => ({ skus: skus.filter(sku => saved.has(sku)), barcodes: [] }),
    create: async input => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.ok(!saved.has(input.sku)); saved.set(input.sku, input); active--;
      return `product-${input.sku}`;
    },
  };
  return { deps, saved, maximum: () => maximum };
}

for (const count of [50, 3687]) test(`${count} rows use bounded batches and preserve inactive/no-stock semantics; reimport skips existing SKUs`, async () => {
  const data = dependencies(); let requests = 0;
  const submit = async (batch: ProductImportCommitRow[]) => { assert.ok(batch.length <= 50); requests++; return commitProductImportWith(batch, data.deps); };
  const results = await submitProductImportBatches(rows(count), submit, () => {});
  assert.equal(results.filter(result => result.status === "success").length, count);
  assert.equal(requests, Math.ceil(count / 50));
  assert.ok(data.maximum() <= 4);
  for (const input of data.saved.values()) {
    assert.equal(input.isActive, false);
    assert.equal("initialStock" in input, false);
    assert.equal(input.taxRate, 0);
  }
  const repeated = await submitProductImportBatches(rows(count), submit, () => {});
  assert.ok(repeated.every(result => result.error?.code === "DUPLICATE_SKU"));
  assert.equal(data.saved.size, count);
});

test("invalid rows do not block valid rows; metadata is never sent to createProduct", async () => {
  const data = dependencies(); const input = rows(5);
  input[1].name = ""; input[2].sellingPrice = -1; input[3].drugClassification = "PERLU VERIFIKASI"; input[4].subcategoryId = null;
  const results = await commitProductImportWith([{ ...input[0], reference_url: "https://example.test", opening_stock: 99, review_notes: "metadata" }, ...input.slice(1)], data.deps);
  assert.equal(results.filter(result => result.status === "success").length, 1);
  assert.equal(results.filter(result => result.status === "failed").length, 4);
  const saved = [...data.saved.values()][0];
  for (const key of ["reference_url", "opening_stock", "review_notes", "description", "initialStock"]) assert.ok(!(key in saved));
});

test("within-batch duplicates fail per row and no product is overwritten", async () => {
  const data = dependencies(); const input = rows(2); input[1].sku = input[0].sku;
  const results = await commitProductImportWith(input, data.deps);
  assert.ok(results.every(result => result.error?.code === "DUPLICATE_SKU"));
  assert.equal(data.saved.size, 0);
});

test("network failure stops batching and preserves acknowledged progress without automatic retry", async () => {
  let requests = 0, completed = 0;
  await assert.rejects(submitProductImportBatches(rows(150), async batch => {
    if (++requests === 2) throw new Error("network");
    return batch.map(row => ({ row: row.rowNumber, sku: row.sku, status: "success" }));
  }, (_, count) => { completed = count; }), /network/);
  assert.equal(requests, 2); assert.equal(completed, 50);
});
