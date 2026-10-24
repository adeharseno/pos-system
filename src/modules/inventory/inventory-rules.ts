export const EXPIRING_SOON_DAYS = 90;

export type InventoryStockStatus = "out" | "low" | "safe";
export type InventoryExpiryStatus = "expired" | "expiring_soon" | "safe";
export type InventoryBatchBalance = { quantity: number; expiredDate: string };

export const inventoryBusinessDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function inventoryStockStatus(availableStock: number, minimumStock: number): InventoryStockStatus {
  return availableStock === 0 ? "out" : availableStock <= minimumStock ? "low" : "safe";
}

export function summarizeInventoryBatches(batches: InventoryBatchBalance[], minimumStock: number, businessDate = inventoryBusinessDate()) {
  let availableStock = 0;
  let nearestExpiry: string | null = null;
  for (const batch of batches) {
    if (batch.quantity <= 0 || batch.expiredDate < businessDate) continue;
    availableStock += batch.quantity;
    if (nearestExpiry === null || batch.expiredDate < nearestExpiry) nearestExpiry = batch.expiredDate;
  }
  return { availableStock, nearestExpiry, stockStatus: inventoryStockStatus(availableStock, minimumStock) };
}

export function inventoryExpiryStatus(expiredDate: string, businessDate = inventoryBusinessDate()): InventoryExpiryStatus {
  if (expiredDate < businessDate) return "expired";
  const soonDate = new Date(`${businessDate}T00:00:00Z`);
  soonDate.setUTCDate(soonDate.getUTCDate() + EXPIRING_SOON_DAYS);
  return expiredDate <= soonDate.toISOString().slice(0, 10) ? "expiring_soon" : "safe";
}
