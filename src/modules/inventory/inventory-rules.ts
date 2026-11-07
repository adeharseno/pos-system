import { stockStatus, type StockStatus } from "@/modules/shared/stock-status";

export const EXPIRING_SOON_DAYS = 90;

export type InventoryStockStatus = StockStatus;
export type InventoryExpiryStatus = "unknown" | "expired" | "expiring_soon" | "safe";
export type InventoryBatchBalance = { quantity: number; expiredDate: string | null };

export const inventoryBusinessDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function summarizeInventoryBatches(batches: InventoryBatchBalance[], minimumStock: number, businessDate = inventoryBusinessDate()) {
  let availableStock = 0;
  let nearestExpiry: string | null = null;
  for (const batch of batches) {
    if (batch.quantity <= 0 || (batch.expiredDate !== null && batch.expiredDate < businessDate)) continue;
    availableStock += batch.quantity;
    if (batch.expiredDate !== null && (nearestExpiry === null || batch.expiredDate < nearestExpiry)) nearestExpiry = batch.expiredDate;
  }
  return { availableStock, nearestExpiry, stockStatus: stockStatus(availableStock, minimumStock) };
}

export function inventoryExpiryStatus(expiredDate: string | null, businessDate = inventoryBusinessDate()): InventoryExpiryStatus {
  if (expiredDate === null) return "unknown";
  if (expiredDate < businessDate) return "expired";
  const soonDate = new Date(`${businessDate}T00:00:00Z`);
  soonDate.setUTCDate(soonDate.getUTCDate() + EXPIRING_SOON_DAYS);
  return expiredDate <= soonDate.toISOString().slice(0, 10) ? "expiring_soon" : "safe";
}
