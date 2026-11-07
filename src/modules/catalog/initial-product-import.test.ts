import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { buildInitialProductImportPreview, validateInitialImportConfirmation } from "./application/initial-product-import";
import type { ProductImportMasterData } from "./application/preview-product-import";

const headers = ["No.", "Nama", "Harga", "SKU", "Satuan Dasar", "Sub kategori", "Klasifikasi", "Stok", "Supplier"];

const master: ProductImportMasterData = {
  categories: [
    { id: "cat-bebas", name: "Obat Bebas" },
    { id: "cat-resep", name: "Obat Resep" },
    { id: "cat-psiko", name: "Psikotropika" },
  ],
  subcategories: [
    { id: "sub-tablet", name: "Tablet" },
    { id: "sub-syrup", name: "Syrup" },
  ],
  suppliers: [{ id: "sup-a", name: "PT Sehat" }],
  locations: [],
};

function workbook(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Produk");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const validRow = ["1", "Amlodipine 10mg", "16,500", "00200710", "TAB", "Tablet", "Obat Resep", "10", ""];

test("preview preserves leading-zero SKU and defaults a missing Harga Modal to numeric 0", () => {
  const preview = buildInitialProductImportPreview(workbook([validRow]), "produk_final.xlsx", master);
  assert.equal(preview.errors, 0);
  assert.equal(preview.valid, 1);
  assert.equal(preview.rows[0].sku, "00200710");
  assert.equal(preview.rows[0].sellingPrice, 16500);
  assert.equal(preview.rows[0].costPrice, 0);
  assert.equal(preview.rows[0].stock, 10);
  assert.equal(preview.rows[0].categoryId, "cat-resep");
  assert.equal(preview.rows[0].subcategoryId, "sub-tablet");
  assert.equal(preview.rows[0].drugClassification, "prescription_required");
  assert.equal(preview.totalStock, 10);
});

test("preview resolves supplier and maps psikotropika to prescription required", () => {
  const preview = buildInitialProductImportPreview(
    workbook([["2", "Psikotropika A", "5,000", "001", "CAP", "Tablet", "Psikotropika", "4", "pt sehat"]]),
    "produk_final.xlsx",
    master,
  );
  assert.equal(preview.errors, 0);
  assert.equal(preview.rows[0].supplierId, "sup-a");
  assert.equal(preview.rows[0].drugClassification, "prescription_required");
});

test("preview generates deterministic SKU and preserves explicit unknown master states", () => {
  const preview = buildInitialProductImportPreview(
    workbook([["3", "Tanpa Identitas", "10,000", "", "", "", "", "10", ""]]),
    "produk_final.xlsx",
    master,
  );
  assert.equal(preview.valid, 1);
  assert.equal(preview.errors, 0);
  assert.equal(preview.rows[0].sku, "INT-00002");
  assert.equal(preview.rows[0].generatedSku, true);
  assert.equal(preview.rows[0].baseUnit, null);
  assert.equal(preview.rows[0].categoryId, null);
  assert.equal(preview.rows[0].subcategoryId, null);
  assert.equal(preview.totalStock, 10);
  assert.equal(preview.rows[0].warnings.length, 4);
});

test("preview flags every duplicate SKU in the file case-insensitively", () => {
  const preview = buildInitialProductImportPreview(
    workbook([
      ["1", "A", "1,000", "abc", "TAB", "Tablet", "Obat Bebas", "1", ""],
      ["2", "B", "1,000", "ABC", "TAB", "Tablet", "Obat Bebas", "1", ""],
    ]),
    "produk_final.xlsx",
    master,
  );
  assert.equal(preview.errors, 2);
  assert.ok(preview.rows.every(row => row.errors.includes("SKU duplikat di dalam berkas.")));
});

test("preview rejects unknown category/subcategory but preserves unknown supplier as warning", () => {
  const preview = buildInitialProductImportPreview(
    workbook([["1", "A", "1,000", "SKU-1", "TAB", "Kapsul", "Kategori Asing", "1", "Pemasok Asing"]]),
    "produk_final.xlsx",
    master,
  );
  assert.equal(preview.errors, 1);
  assert.ok(preview.rows[0].errors.includes("Klasifikasi Excel tidak dikenali."));
  assert.ok(preview.rows[0].errors.includes("Sub kategori Excel tidak dikenali."));
  assert.ok(preview.rows[0].warnings.includes("Supplier belum terhubung; teks asli tetap disimpan."));
});

test("duplicate names remain separate and are reported as warnings", () => {
  const preview = buildInitialProductImportPreview(workbook([
    ["1", "Nama Sama", "1,000", "A", "TAB", "Tablet", "Obat Bebas", "1", ""],
    ["2", "nama sama", "2,000", "B", "TAB", "Tablet", "Obat Bebas", "1", ""],
  ]), "produk_final.xlsx", master);
  assert.equal(preview.valid, 2);
  assert.equal(preview.warnings, 2);
  assert.ok(preview.rows.every(row => row.warnings.some(warning => warning.includes("duplikat"))));
  assert.throws(() => validateInitialImportConfirmation(preview, false), /harus disetujui/);
  assert.doesNotThrow(() => validateInitialImportConfirmation(preview, true));
});

test("preview validates prices and whole-number stock", () => {
  const preview = buildInitialProductImportPreview(
    workbook([["1", "A", "bukan angka", "SKU-1", "TAB", "Tablet", "Obat Bebas", "1.5", ""]]),
    "produk_final.xlsx",
    master,
  );
  assert.equal(preview.errors, 1);
  assert.ok(preview.rows[0].errors.includes("Harga tidak valid."));
  assert.ok(preview.rows[0].errors.includes("Stok harus bilangan bulat minimal 0."));
});

test("preview rejects non-xlsx files and missing headers", () => {
  assert.throws(() => buildInitialProductImportPreview(workbook([validRow]), "produk.csv", master), /\.xlsx/);
  const sheet = XLSX.utils.aoa_to_sheet([["Nama", "Harga"], ["A", "1,000"]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Produk");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.throws(() => buildInitialProductImportPreview(bytes, "produk.xlsx", master), /Kolom SKU tidak ditemukan/);
});
