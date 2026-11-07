import { stockStatus, type StockStatus } from "@/modules/shared/stock-status";

export type StockListRow = {
  id: string; sku: string; name: string; genericName: string | null; manufacturer: string | null;
  baseUnit: string; requiresPrescription: boolean; isActive: boolean; category: string;
  subcategory: string; defaultSupplier: string | null; storageLocation: string | null;
  unitCount: number; availableStock: number; minimumStock: number; stockStatus: StockStatus;
  nearestExpiry: string | null; baseSellingPrice: number | null;
};

const nullableString = (value: unknown) => value === null || typeof value === "string";
const safeInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;

export function parseStockListReadModel(value: unknown): { rows: StockListRow[]; total: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid stock list result");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.rows) || !safeInteger(result.total)) throw new TypeError("Invalid stock list result");
  const rows = result.rows.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Invalid stock list row");
    const row = item as Record<string, unknown>;
    if (![row.id,row.sku,row.name,row.category,row.subcategory].every((field) => typeof field === "string")
      || !nullableString(row.baseUnit)
      || ![row.genericName,row.manufacturer,row.defaultSupplier,row.storageLocation,row.nearestExpiry].every(nullableString)
      || typeof row.requiresPrescription !== "boolean" || typeof row.isActive !== "boolean"
      || ![row.unitCount,row.availableStock,row.minimumStock].every(safeInteger)
      || (row.baseSellingPrice !== null && typeof row.baseSellingPrice !== "number")) throw new TypeError("Invalid stock list row");
    const expected = stockStatus(Number(row.availableStock), Number(row.minimumStock));
    if (row.stockStatus !== expected) throw new TypeError("Inconsistent stock status");
    return { ...row, baseUnit: row.baseUnit ?? "Belum Ditentukan" } as StockListRow;
  });
  return { rows, total: Number(result.total) };
}
