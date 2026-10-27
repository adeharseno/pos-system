import { PosInputError, requireNonBlank, requireNonNegativeMoney, requireUuid } from "@/modules/shared/validation/input";
import { PosDataAccessError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import type { CreateProductInput } from "./create-product";
import type { ProductImportMasterData } from "./preview-product-import";

export type ProductImportCommitRow = {
  rowNumber: number; sku: string; name: string; genericName: string; manufacturer: string; baseUnit: string;
  sellingPrice: number; costPrice: number; barcode: string; drugClassification: string; minimumStock: number; isActive: boolean;
  categoryId: string | null; subcategoryId: string | null; defaultSupplierId: string | null; storageLocationId: string | null;
};
export type ProductImportCommitResult = { row: number; sku: string; status: "success" | "failed"; product_id?: string; error?: { code: string; message: string } };
export type ProductImportDependencies = {
  master: () => Promise<ProductImportMasterData>;
  existing: (skus: string[], barcodes: string[]) => Promise<{ skus: string[]; barcodes: string[] }>;
  create: (input: CreateProductInput) => Promise<string>;
};
const safeMessages: Record<string, string> = {
  DUPLICATE_SKU: "SKU sudah digunakan. Barang yang ada tidak diubah.", DUPLICATE_BARCODE: "Barcode sudah digunakan oleh barang lain.",
  INVALID_CATEGORY_SUBCATEGORY: "Kategori atau subkategori belum dipetakan dengan benar.", INVALID_SUPPLIER: "Pemasok tidak valid.",
  INVALID_STORAGE_LOCATION: "Lokasi penyimpanan tidak valid.", INVALID_PRODUCT_INPUT: "Data barang tidak valid.",
  DATABASE_OPERATION_FAILED: "Barang gagal diimpor.",
};
function normalizeRow(value: unknown): ProductImportCommitRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Baris barang tidak valid.");
  const row = value as Record<string, unknown>;
  const number = (key: string, label: string, optional = false) => {
    const raw = row[key];
    if (raw === undefined || raw === null || raw === "") { if (optional) return 0; throw new PosInputError(`${label} wajib diisi.`); }
    if (typeof raw !== "number" && (typeof raw !== "string" || !/^\d+(\.\d{1,2})?$/.test(raw))) throw new PosInputError(`${label} tidak valid.`);
    const parsed = Number(raw);
    try { return requireNonNegativeMoney(parsed, key); } catch { throw new PosInputError(`${label} tidak valid.`); }
  };
  const text = (key: string, label: string, required = false) => {
    if (typeof row[key] !== "string") { if (!required && row[key] === undefined) return ""; throw new PosInputError(`${label} tidak valid.`); }
    try { return required ? requireNonBlank(row[key], key) : row[key].trim(); } catch { throw new PosInputError(`${label} wajib diisi.`); }
  };
  const nullableId = (key: string) => {
    if (row[key] === null || row[key] === undefined || row[key] === "") return null;
    if (typeof row[key] !== "string") throw new PosInputError("Pemetaan data acuan tidak valid.");
    try { return requireUuid(row[key], key); } catch { throw new PosInputError("Pemetaan data acuan tidak valid."); }
  };
  const classification = text("drugClassification", "Klasifikasi obat", true);
  if (!["otc", "otc_limited", "prescription_required"].includes(classification)) throw new PosInputError("Klasifikasi obat tidak valid atau belum diverifikasi.");
  const rowNumber = Number(row.rowNumber);
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) throw new PosInputError("Nomor baris tidak valid.");
  const minimumStock = number("minimumStock", "Minimum stok", true);
  if (!Number.isSafeInteger(minimumStock)) throw new PosInputError("Minimum stok harus bilangan bulat.");
  if (row.isActive !== undefined && typeof row.isActive !== "boolean") throw new PosInputError("Status aktif tidak valid.");
  return { rowNumber, sku: text("sku", "SKU", true), name: text("name", "Nama barang", true), genericName: text("genericName", "Nama generik"), manufacturer: text("manufacturer", "Produsen"), baseUnit: text("baseUnit", "Satuan dasar", true), sellingPrice: number("sellingPrice", "Harga jual"), costPrice: number("costPrice", "Harga modal", true), barcode: text("barcode", "Barcode"), drugClassification: classification, minimumStock, isActive: row.isActive === undefined ? true : row.isActive, categoryId: nullableId("categoryId"), subcategoryId: nullableId("subcategoryId"), defaultSupplierId: nullableId("defaultSupplierId"), storageLocationId: nullableId("storageLocationId") };
}

// Single import pipeline. Production dependencies always call the existing createProduct RPC path.
export async function commitProductImportWith(payload: unknown, dependencies: ProductImportDependencies): Promise<ProductImportCommitResult[]> {
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 500) throw new PosInputError("Maksimal 500 baris per permintaan impor.");
  const results: ProductImportCommitResult[] = new Array(payload.length);
  const rows: Array<{ row: ProductImportCommitRow; index: number }> = [];
  payload.forEach((value, index) => {
    try { rows.push({ row: normalizeRow(value), index }); }
    catch (error) {
      const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
      results[index] = { row: Number.isSafeInteger(raw.rowNumber) ? Number(raw.rowNumber) : index + 2, sku: typeof raw.sku === "string" ? raw.sku : "", status: "failed", error: { code: "INVALID_IMPORT_ROW", message: error instanceof PosInputError ? error.message : "Data barang tidak valid." } };
    }
  });
  if (!rows.length) return results;
  const skuCounts = new Map<string, number>(), barcodeCounts = new Map<string, number>();
  for (const { row } of rows) {
    const sku = row.sku.toLocaleLowerCase("id-ID"); skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (row.barcode) barcodeCounts.set(row.barcode, (barcodeCounts.get(row.barcode) ?? 0) + 1);
  }
  const master = await dependencies.master();
  const categories = new Set(master.categories.map(value => value.id));
  const subcategories = new Map(master.subcategories.map(value => [value.id, value.category_id]));
  const suppliers = new Set(master.suppliers.map(value => value.id)), locations = new Set(master.locations.map(value => value.id));
  const ready = rows.filter(({ row, index }) => {
    const code = (skuCounts.get(row.sku.toLocaleLowerCase("id-ID")) ?? 0) > 1 ? "DUPLICATE_SKU"
      : row.barcode && (barcodeCounts.get(row.barcode) ?? 0) > 1 ? "DUPLICATE_BARCODE"
      : !row.categoryId || !row.subcategoryId || !categories.has(row.categoryId) || subcategories.get(row.subcategoryId) !== row.categoryId ? "INVALID_CATEGORY_SUBCATEGORY"
      : row.defaultSupplierId && !suppliers.has(row.defaultSupplierId) ? "INVALID_SUPPLIER"
      : row.storageLocationId && !locations.has(row.storageLocationId) ? "INVALID_STORAGE_LOCATION" : undefined;
    if (code) { results[index] = { row: row.rowNumber, sku: row.sku, status: "failed", error: { code, message: safeMessages[code] } }; return false; }
    return true;
  });
  if (!ready.length) return results;
  const existing = await dependencies.existing(ready.map(({ row }) => row.sku), ready.map(({ row }) => row.barcode).filter(Boolean));
  const existingSkus = new Set(existing.skus), existingBarcodes = new Set(existing.barcodes);
  let cursor = 0;
  const worker = async () => {
    while (cursor < ready.length) {
      const { row, index } = ready[cursor++];
      const duplicate = existingSkus.has(row.sku) ? "DUPLICATE_SKU" : row.barcode && existingBarcodes.has(row.barcode) ? "DUPLICATE_BARCODE" : undefined;
      if (duplicate) { results[index] = { row: row.rowNumber, sku: row.sku, status: "failed", error: { code: duplicate, message: safeMessages[duplicate] } }; continue; }
      try {
        const productId = await dependencies.create({ sku: row.sku, name: row.name, categoryId: row.categoryId!, subcategoryId: row.subcategoryId!, baseUnit: row.baseUnit, sellingPrice: row.sellingPrice, genericName: row.genericName || undefined, manufacturer: row.manufacturer || undefined, classification: row.drugClassification as CreateProductInput["classification"], costPrice: row.costPrice, taxRate: 0, isTaxable: false, minimumStock: row.minimumStock, supplierId: row.defaultSupplierId || undefined, storageId: row.storageLocationId || undefined, barcode: row.barcode || undefined, isActive: row.isActive });
        existingSkus.add(row.sku); if (row.barcode) existingBarcodes.add(row.barcode);
        results[index] = { row: row.rowNumber, sku: row.sku, status: "success", product_id: productId };
      } catch (error) {
        const code = error instanceof PosDomainError ? error.code : error instanceof PosDataAccessError ? "DATABASE_OPERATION_FAILED" : "IMPORT_FAILED";
        results[index] = { row: row.rowNumber, sku: row.sku, status: "failed", error: { code, message: safeMessages[code] ?? "Barang gagal diimpor." } };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ready.length) }, worker));
  return results;
}
