import { PosInputError } from "@/modules/shared/validation/input";
import type { CashierProductResult, CashierProductUnit } from "./types";

export interface RawCashierProductUnit {
  id: string;
  unit_name?: string | null;
  label?: string | null;
  conversion_to_base?: number;
  conversionToBase?: number;
  selling_price?: number;
  displayedUnitPrice?: number;
  barcode?: string | null;
  is_base_unit?: boolean | null;
  is_active?: boolean | null;
}

export function cashierUnitSaleState(stock: number, price: number) {
  if (stock <= 0) return { enabled: false, label: "Stok habis" } as const;
  if (!Number.isFinite(price) || price <= 0) return { enabled: false, label: "Harga belum diatur" } as const;
  return { enabled: true, label: "+ Tambah" } as const;
}

export function parseProductSearchQuery(value: string | null) {
  const query = (value ?? "").trim();
  if (query.length > 80 || !/^[-.\p{L}\p{N}_ ]*$/u.test(query)) throw new PosInputError("invalid product search query");
  return query;
}

export function parseBarcode(value: string | null) {
  const barcode = (value ?? "").trim();
  if (!barcode || barcode.length > 128) throw new PosInputError("invalid barcode");
  return barcode;
}

function unitQualityScore(u: RawCashierProductUnit): number {
  let score = 0;
  if (u.is_base_unit === true) score += 100;
  const name = (u.unit_name ?? u.label ?? "").trim();
  if (name.length > 0) score += 10;
  const price = u.selling_price ?? u.displayedUnitPrice ?? 0;
  if (price > 0) score += 5;
  if (u.barcode && u.barcode.trim().length > 0) score += 1;
  return score;
}

/**
 * Normalizes cashier unit choices by eliminating semantically duplicate units:
 * - Collapses duplicate units of the same packaging/conversion tier into the authoritative unit.
 * - Prioritizes the primary base unit (is_base_unit = true) as the single authoritative active price.
 * - Eliminates nameless ghost units that share a conversion tier with a named unit.
 * - Collapses exact duplicate names (case-insensitive) of the same conversion tier.
 * - Preserves units with distinct conversions (e.g. tablet vs strip vs box).
 * - Preserves units with distinct valid packaging names even at the same conversion (e.g. tablet vs kapsul).
 * - Preserves standalone products with missing/empty unit names so they can still be sold.
 */
export function deduplicateCashierUnits<T extends RawCashierProductUnit>(rawUnits: T[]): CashierProductUnit[] {
  const activeUnits = rawUnits.filter((u) => u.is_active !== false);
  if (activeUnits.length === 0) return [];
  if (activeUnits.length === 1) {
    const u = activeUnits[0];
    return [{
      id: u.id,
      label: (u.unit_name ?? u.label ?? "").trim(),
      conversionToBase: u.conversion_to_base ?? u.conversionToBase ?? 1,
      displayedUnitPrice: u.selling_price ?? u.displayedUnitPrice ?? 0,
      barcode: u.barcode ?? null,
    }];
  }

  const result: T[] = [];

  for (const unit of activeUnits) {
    const unitConv = unit.conversion_to_base ?? unit.conversionToBase ?? 1;
    const unitName = (unit.unit_name ?? unit.label ?? "").trim();

    const duplicateIndex = result.findIndex((existing) => {
      const existingConv = existing.conversion_to_base ?? existing.conversionToBase ?? 1;

      if (existingConv !== unitConv) return false;

      const existingName = (existing.unit_name ?? existing.label ?? "").trim();

      // Case 1: Both names are non-empty and identical (case-insensitive)
      if (existingName && unitName && existingName.toLowerCase() === unitName.toLowerCase()) {
        return true;
      }

      // Case 2: One is non-empty and the other is empty -> duplicate of the same conversion tier
      if ((existingName && !unitName) || (!existingName && unitName)) {
        return true;
      }

      // Case 3: Both are empty -> duplicate of the same conversion tier
      if (!existingName && !unitName) {
        return true;
      }

      // Both have valid, different names -> NOT duplicate (e.g. "Tablet" vs "Kapsul")
      return false;
    });

    if (duplicateIndex === -1) {
      result.push({ ...unit });
    } else {
      const existing = result[duplicateIndex];
      const existingScore = unitQualityScore(existing);
      const newScore = unitQualityScore(unit);

      const resolvedName = (unit.unit_name ?? unit.label ?? "").trim() || (existing.unit_name ?? existing.label ?? "");
      const resolvedBarcode = unit.barcode ?? existing.barcode ?? null;

      if (newScore > existingScore) {
        result[duplicateIndex] = {
          ...unit,
          unit_name: resolvedName,
          label: resolvedName,
          barcode: resolvedBarcode,
        };
      } else {
        result[duplicateIndex] = {
          ...existing,
          unit_name: resolvedName,
          label: resolvedName,
          barcode: resolvedBarcode,
        };
      }
    }
  }

  return result.map((u) => ({
    id: u.id,
    label: (u.unit_name ?? u.label ?? "").trim(),
    conversionToBase: u.conversion_to_base ?? u.conversionToBase ?? 1,
    displayedUnitPrice: u.selling_price ?? u.displayedUnitPrice ?? 0,
    barcode: u.barcode ?? null,
  }));
}

export function buildCashierProductResults(
  products: Array<{
    id: string;
    name: string;
    sku: string;
    requires_prescription: boolean | null;
    product_units: Array<{
      id: string;
      unit_name: string;
      conversion_to_base: number;
      selling_price: number;
      barcode: string | null;
      is_base_unit?: boolean | null;
      is_active?: boolean | null;
    }>;
  }>,
  batches: Array<{ product_id: string; quantity: number }>
): CashierProductResult[] {
  const stock = new Map<string, number>();
  for (const batch of batches) stock.set(batch.product_id, (stock.get(batch.product_id) ?? 0) + batch.quantity);
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    requiresPrescription: product.requires_prescription === true,
    availableStockBase: stock.get(product.id) ?? 0,
    units: deduplicateCashierUnits(product.product_units),
  }));
}
