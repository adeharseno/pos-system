import assert from "node:assert/strict";
import test from "node:test";

import { parseStockListReadModel } from "./stock-list-read-model-parser";

const row = (availableStock: number, minimumStock: number, stockStatus: "out" | "low" | "normal") => ({
  id: crypto.randomUUID(), sku: "SKU", name: "Produk", genericName: null, manufacturer: null,
  baseUnit: "Tablet", requiresPrescription: false, isActive: true, category: "Obat",
  subcategory: "—", defaultSupplier: null, storageLocation: null, unitCount: 1,
  availableStock, minimumStock, stockStatus, nearestExpiry: "2030-01-01", baseSellingPrice: 1000,
});

test("stock read model accepts every standardized stock boundary", () => {
  const rows = [row(0, 0, "out"), row(0, 5, "out"), row(4, 5, "low"), row(5, 5, "low"), row(6, 5, "normal"), row(1, 0, "normal")];
  assert.deepEqual(parseStockListReadModel({ rows, total: 21 }), { rows, total: 21 });
});

test("stock read model rejects a status inconsistent with quantities", () => {
  assert.throws(() => parseStockListReadModel({ rows: [row(5, 5, "normal")], total: 1 }), /Inconsistent stock status/);
});

test("stock read model preserves an empty page total", () => {
  assert.deepEqual(parseStockListReadModel({ rows: [], total: 42 }), { rows: [], total: 42 });
});

test("bulk-import products with an unknown unit remain listable and paginated", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...row(10, 0, "normal"), id: crypto.randomUUID(), sku: `INT-${String(index + 2).padStart(5, "0")}`,
    name: `Produk impor ${index + 1}`, baseUnit: index % 2 === 0 ? null : "TAB",
    category: index % 2 === 0 ? "—" : "Obat Resep", subcategory: index % 2 === 0 ? "—" : "Tablet",
    unitCount: index % 2 === 0 ? 0 : 1, baseSellingPrice: index % 2 === 0 ? null : 1000,
    nearestExpiry: null,
  }));
  const result = parseStockListReadModel({ rows, total: 3696 });
  assert.equal(result.total, 3696);
  assert.equal(result.rows.length, 20);
  assert.equal(result.rows[0].baseUnit, "Belum Ditentukan");
  assert.equal(result.rows[1].baseUnit, "TAB");
});
