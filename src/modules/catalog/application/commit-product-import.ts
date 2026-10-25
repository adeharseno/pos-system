import "server-only";

import { createProduct } from "./create-product";
import { getProductCreateMasterData } from "../data/admin-product-queries";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError, PosDataAccessError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError, requireNonBlank, requireNonNegativeMoney, requireUuid } from "@/modules/shared/validation/input";
import type { Database } from "@/types/database.types";

export type ProductImportCommitRow = {
  rowNumber: number;
  sku: string;
  name: string;
  genericName: string;
  manufacturer: string;
  baseUnit: string;
  sellingPrice: number;
  costPrice: number;
  barcode: string;
  drugClassification: string;
  minimumStock: number;
  categoryId: string | null;
  subcategoryId: string | null;
  defaultSupplierId: string | null;
  storageLocationId: string | null;
};

export type ProductImportCommitResult = {
  row: number;
  sku: string;
  status: "success" | "failed";
  product_id?: string;
  error?: { code: string; message: string };
};

const allowedClassifications = new Set<Database["public"]["Enums"]["drug_classification"]>(["otc", "otc_limited", "prescription_required"]);
const safeMessages: Record<string, string> = {
  DUPLICATE_SKU: "SKU sudah digunakan oleh produk lain.",
  DUPLICATE_BARCODE: "Barcode sudah digunakan oleh unit produk lain.",
  INVALID_CATEGORY_SUBCATEGORY: "Kombinasi kategori dan subkategori tidak valid.",
  INVALID_SUPPLIER: "Pemasok tidak valid. Periksa kembali pilihan pemasok.",
  INVALID_STORAGE_LOCATION: "Lokasi penyimpanan tidak valid.",
  INVALID_PRODUCT_INPUT: "Data produk tidak valid.",
  DATABASE_OPERATION_FAILED: "Produk gagal diimpor.",
};

function optionalId(value: string | null, field: string) {
  return value === null ? undefined : requireUuid(value, field);
}

function normalizeRow(value: unknown): ProductImportCommitRow {
  if (!value || typeof value !== "object") throw new PosInputError("Invalid import row");
  const row = value as Record<string, unknown>;
  const number = (key: string) => {
    const parsed = typeof row[key] === "number" ? row[key] : Number(row[key]);
    return requireNonNegativeMoney(parsed, key);
  };
  const text = (key: string, required = false) => {
    if (typeof row[key] !== "string") throw new PosInputError(`Invalid ${key}`);
    return required ? requireNonBlank(row[key], key) : row[key].trim();
  };
  const nullableId = (key: string) => row[key] === null ? null : typeof row[key] === "string" ? row[key] : (() => { throw new PosInputError(`Invalid ${key}`); })();
  const classification = text("drugClassification", true);
  if (!allowedClassifications.has(classification as Database["public"]["Enums"]["drug_classification"])) throw new PosInputError("Invalid classification");
  const rowNumber = Number(row.rowNumber);
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) throw new PosInputError("Invalid row number");
  const minimumStock = number("minimumStock");
  if (!Number.isSafeInteger(minimumStock)) throw new PosInputError("Invalid minimumStock");
  return {
    rowNumber,
    sku: text("sku", true), name: text("name", true), genericName: text("genericName"), manufacturer: text("manufacturer"), baseUnit: text("baseUnit", true),
    sellingPrice: number("sellingPrice"), costPrice: number("costPrice"), barcode: text("barcode"),
    drugClassification: classification, minimumStock,
    categoryId: nullableId("categoryId"), subcategoryId: nullableId("subcategoryId"), defaultSupplierId: nullableId("defaultSupplierId"), storageLocationId: nullableId("storageLocationId"),
  };
}

export async function commitProductImport(payload: unknown): Promise<ProductImportCommitResult[]> {
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 500) throw new PosInputError("Invalid import rows");
  const rows = payload.map(normalizeRow);
  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();
  for (const row of rows) {
    const sku = row.sku.toLocaleLowerCase("id-ID");
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (row.barcode) barcodeCounts.set(row.barcode, (barcodeCounts.get(row.barcode) ?? 0) + 1);
  }
  if ([...skuCounts.values(), ...barcodeCounts.values()].some((count) => count > 1)) throw new PosInputError("Duplicate values in import rows");

  const master = await getProductCreateMasterData();
  const categories = new Set(master.categories.map((value) => value.id));
  const subcategories = new Map(master.subcategories.map((value) => [value.id, value.category_id]));
  const suppliers = new Set(master.suppliers.map((value) => value.id));
  const locations = new Set(master.locations.map((value) => value.id));
  for (const row of rows) {
    const categoryId = optionalId(row.categoryId, "categoryId");
    const subcategoryId = optionalId(row.subcategoryId, "subcategoryId");
    if (!categoryId || !subcategoryId || !categories.has(categoryId) || subcategories.get(subcategoryId) !== categoryId) throw new PosInputError("Invalid category mapping");
    const supplierId = optionalId(row.defaultSupplierId, "defaultSupplierId");
    const storageId = optionalId(row.storageLocationId, "storageLocationId");
    if (supplierId && !suppliers.has(supplierId)) throw new PosInputError("Invalid supplier mapping");
    if (storageId && !locations.has(storageId)) throw new PosInputError("Invalid storage mapping");
  }

  const client = createAdminSupabaseClient();
  const skus = rows.map((row) => row.sku);
  const barcodes = rows.map((row) => row.barcode).filter(Boolean);
  const [productsResult, unitsResult] = await Promise.all([
    client.from("products").select("sku").in("sku", skus),
    barcodes.length > 0 ? client.from("product_units").select("barcode").in("barcode", barcodes) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) throw mapDatabaseError(productsResult.error);
  if (unitsResult.error) throw mapDatabaseError(unitsResult.error);
  const existingSkus = new Set((productsResult.data ?? []).map((product) => product.sku));
  const existingBarcodes = new Set((unitsResult.data ?? []).flatMap((unit) => unit.barcode ? [unit.barcode] : []));
  const results: ProductImportCommitResult[] = [];
  for (const row of rows) {
    if (existingSkus.has(row.sku)) {
      results.push({ row: row.rowNumber, sku: row.sku, status: "failed", error: { code: "DUPLICATE_SKU", message: safeMessages.DUPLICATE_SKU } });
      continue;
    }
    if (row.barcode && existingBarcodes.has(row.barcode)) {
      results.push({ row: row.rowNumber, sku: row.sku, status: "failed", error: { code: "DUPLICATE_BARCODE", message: safeMessages.DUPLICATE_BARCODE } });
      continue;
    }
    try {
      const productId = await createProduct({
        sku: row.sku, name: row.name, categoryId: row.categoryId!, subcategoryId: row.subcategoryId!, baseUnit: row.baseUnit,
        sellingPrice: row.sellingPrice, genericName: row.genericName || undefined, manufacturer: row.manufacturer || undefined,
        classification: row.drugClassification as Database["public"]["Enums"]["drug_classification"], costPrice: row.costPrice, taxRate: 0, isTaxable: false,
        minimumStock: row.minimumStock, supplierId: row.defaultSupplierId || undefined, storageId: row.storageLocationId || undefined,
        barcode: row.barcode || undefined, isActive: true,
      });
      results.push({ row: row.rowNumber, sku: row.sku, status: "success", product_id: productId });
    } catch (error) {
      const code = error instanceof PosDomainError ? error.code : error instanceof PosDataAccessError ? "DATABASE_OPERATION_FAILED" : "IMPORT_FAILED";
      results.push({ row: row.rowNumber, sku: row.sku, status: "failed", error: { code, message: safeMessages[code] ?? "Produk gagal diimpor." } });
    }
  }
  return results;
}
