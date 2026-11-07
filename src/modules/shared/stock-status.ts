export type StockStatus = "out" | "low" | "normal";

export function stockStatus(availableStock: number, minimumStock: number): StockStatus {
  if (availableStock === 0) return "out";
  if (availableStock <= minimumStock) return "low";
  return "normal";
}
