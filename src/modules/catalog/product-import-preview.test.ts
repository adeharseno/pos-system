import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildProductImportPreview, type ProductImportMasterData } from "./application/preview-product-import";

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
