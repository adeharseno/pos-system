import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type { StockMovementRow } from "./data/stock-movement-read-model-parser";
import { buildStockMovementWorkbook, collectStockMovementExport, safeSpreadsheetText, StockMovementExportError, stockMovementExportFilename } from "./stock-movement-export";

const movement = (index: number, type: StockMovementRow["type"] = "out"): StockMovementRow => ({
  eventId: `sale:${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
  occurredAt: "2026-11-06T17:00:00Z", type, quantity: index + 1, unit: "Tablet",
  employeeName: "Kasir", supplierName: null, referenceNumber: `INV-${index}`, referenceUrl: "/transactions/22222222-2222-4222-8222-222222222222",
  batchNumber: null, reason: null,
});

test("export collector reads every database page without truncating the filtered total", async () => {
  const all = Array.from({ length: 205 }, (_, index) => movement(index));
  const pages: number[] = [];
  const rows = await collectStockMovementExport(async (page, limit) => {
    pages.push(page);
    return { rows: all.slice((page - 1) * limit, page * limit), total: all.length };
  });
  assert.equal(rows.length, 205);
  assert.deepEqual(pages, [1, 2, 3]);
});

test("empty, oversized, and changing exports fail explicitly", async () => {
  await assert.rejects(() => collectStockMovementExport(async () => ({ rows: [], total: 0 })), (error: unknown) => error instanceof StockMovementExportError && error.code === "EMPTY");
  await assert.rejects(() => collectStockMovementExport(async () => ({ rows: [], total: 11 }), 10), (error: unknown) => error instanceof StockMovementExportError && error.code === "LIMIT");
  await assert.rejects(() => collectStockMovementExport(async page => page === 1 ? { rows: [movement(0)], total: 2 } : { rows: [], total: 3 }), (error: unknown) => error instanceof StockMovementExportError && error.code === "CHANGED");
  await assert.rejects(() => collectStockMovementExport(async () => ({ rows: [movement(0)], total: 2 })), (error: unknown) => error instanceof StockMovementExportError && error.code === "CHANGED");
});

test("workbook uses WIB, numeric directional quantities, readable blanks, and sanitized text", () => {
  const sale = { ...movement(0), unit: "@Tablet", employeeName: " =CMD()", batchNumber: "-1+1", reason: null };
  const receipt: StockMovementRow = { ...movement(1, "manual_receiving"), eventId: "manual-receiving:22222222-2222-4222-8222-222222222222", referenceUrl: null };
  const buffer = buildStockMovementWorkbook([sale, receipt], { name: "=HYPERLINK(\"x\")", sku: "+SUM(1,1)" });
  const book = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true });
  assert.deepEqual(rows[0], ["Tanggal (WIB)", "Waktu (WIB)", "Jenis Pergerakan", "Barang Masuk", "Barang Keluar", "Satuan", "Nama Produk", "SKU", "Batch", "Petugas/Kasir", "Pemasok", "Referensi", "Alasan/Keterangan"]);
  assert.deepEqual(rows[1].slice(0, 5), ["07/11/2026", "00:00:00", "Penjualan", 0, 1]);
  assert.deepEqual(rows[2].slice(2, 5), ["Tambah Stok Manual", 2, 0]);
  assert.equal(rows[1][5], "'@Tablet");
  assert.equal(rows[1][6], "'=HYPERLINK(\"x\")");
  assert.equal(rows[1][7], "'+SUM(1,1)");
  assert.equal(rows[1][8], "'-1+1");
  assert.equal(rows[1][9], "' =CMD()");
  assert.equal(rows[1][10], "-");
  assert.equal(rows[1][12], "-");
  assert.ok((sheet["!cols"]?.[6]?.width ?? sheet["!cols"]?.[6]?.wch ?? 0) >= 20);
});

test("filename normalizes an untrusted SKU", () => {
  assert.equal(stockMovementExportFilename("SKU / 001", "2026-11-07"), "riwayat-stok-SKU_001-2026-11-07.xlsx");
  assert.equal(safeSpreadsheetText("normal"), "normal");
});
