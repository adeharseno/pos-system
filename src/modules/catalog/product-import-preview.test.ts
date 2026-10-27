import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildProductImportPreview, buildProductImportPreviewWithInfo, normalizeImportNumber, type ProductImportMasterData } from "./application/preview-product-import";

const master: ProductImportMasterData = { categories: [{ id: "category-a", name: "Obat Bebas" }], subcategories: [{ id: "subcategory-a", category_id: "category-a", name: "Tablet" }], suppliers: [{ id: "supplier-a", name: "PT Kimia Farma" }], locations: [{ id: "location-a", full_code: "RAK-A" }] };
const xlsx = (rows: string[][]) => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Produk"); return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer; };
const headers = ["SKU", "Nama Produk", "Kategori", "Subkategori", "Unit Dasar", "Harga Jual", "Harga Modal", "Barcode", "Klasifikasi Obat", "Minimum Stok", "Supplier", "Lokasi Penyimpanan"];

test("xlsx preview resolves master IDs and preserves a leading-zero barcode", () => {
  const [row] = buildProductImportPreview(xlsx([headers, ["SKU-1", "Produk", "Obat Bebas", "Tablet", "Tablet", "1000", "0", "001234567890", "otc", "0", "PT Kimia Farma", "RAK-A"]]), "produk.xlsx", master);
  assert.equal(row.valid, true); assert.equal(row.barcode, "001234567890"); assert.equal(row.categoryId, "category-a"); assert.equal(row.subcategoryId, "subcategory-a"); assert.equal(row.defaultSupplierId, "supplier-a"); assert.equal(row.storageLocationId, "location-a");
});
test("csv preview detects file duplicates and unresolved mapping", () => {
  const csv = `${headers.join(",")}\nSKU-1,Produk,Unknown,Tablet,Tablet,1000,0,001,otc,0,,\nSKU-1,Produk 2,Unknown,Tablet,Tablet,1000,0,001,otc,0,,`;
  const rows = buildProductImportPreview(new TextEncoder().encode(csv).buffer, "produk.csv", master);
  assert.equal(rows[0].errors.some((error) => error.includes("SKU duplikat")), true); assert.equal(rows[0].errors.some((error) => error.includes("Barcode duplikat")), true); assert.equal(rows[0].errors.some((error) => error.includes("Kategori tidak ditemukan")), true);
});

test("enriched headers map existing fields, ignore metadata and preserve inactive status", () => {
  const [row] = buildProductImportPreview(xlsx([
    ["sku", "name", "category", "subcategory", "unit_name", "selling_price", "cost_price", "classification", "is_active", "manufacturer", "reference_url", "margin_percent", "opening_stock"],
    ["APF-1", "Barang", "Obat Bebas", "Tablet", "Tablet", "Rp 12.500", "10.000", "Obat Keras", "false", "BELUM DIKETAHUI (DUMMY)", "https://example.test", "99", "500"],
  ]), "enriched.xlsx", master);
  assert.equal(row.valid, true);
  assert.equal(row.sellingPrice, "12500");
  assert.equal(row.costPrice, "10000");
  assert.equal(row.drugClassification, "prescription_required");
  assert.equal(row.isActive, false);
  assert.equal(row.manufacturer, "");
  assert.equal("openingStock" in row, false);
  assert.equal("reference_url" in row, false);
});

test("all product sheets are read; reference sheets ignored; duplicates detected across sheets", () => {
  const book = XLSX.utils.book_new();
  for (const sheet of ["Produk A", "Produk B"]) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ["SKU-SAME", "Barang", "Obat Bebas", "Tablet", "Tablet", "1000", "0", "", "otc", "0", "", ""]]), sheet);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["PETUNJUK", "Isi"], ["Referensi", "Tidak diimpor"]]), "Petunjuk");
  const preview = buildProductImportPreviewWithInfo(XLSX.write(book, { type: "array", bookType: "xlsx" }), "multi.xlsx", master);
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(preview.info.productSheets, ["Produk A", "Produk B"]);
  assert.deepEqual(preview.info.ignoredSheets, ["Petunjuk"]);
  assert.deepEqual(preview.rows.map(row => row.rowNumber), [2, 3]);
  assert.ok(preview.rows.every(row => row.baseErrors.some(error => error.includes("SKU duplikat"))));
});

test("unverified classification, blank required fields and malformed prices remain row errors", () => {
  const rows = buildProductImportPreview(xlsx([
    ["sku", "name", "category", "subcategory", "unit_name", "selling_price", "classification", "is_active"],
    ["A", "Barang", "Obat Bebas", "Tablet", "Tablet", "1000", "PERLU VERIFIKASI", "false"],
    ["B", "", "Obat Bebas", "Tablet", "Tablet", "abc", "otc", "-1"],
  ]), "invalid.xlsx", master);
  assert.ok(rows.every(row => !row.valid));
  assert.ok(rows[0].baseErrors.some(error => error.includes("Klasifikasi")));
  for (const field of ["Nama produk", "Harga jual", "Status aktif"]) assert.ok(rows[1].baseErrors.some(error => error.includes(field)));
  assert.equal(rows[0].isActive, false);
});

test("money normalization distinguishes grouping and decimals without inventing missing values", () => {
  for (const [input, expected] of [["1.234,56", "1234.56"], ["1,234.56", "1234.56"], ["12,500", "12500"], ["12500.50", "12500.5"], ["1,234,56", "1,234,56"], ["", ""], ["abc", "abc"]]) assert.equal(normalizeImportNumber(input), expected);
});
