export type ProductStockStatus = "out" | "low" | "normal";

export function productStockStatus(availableStock: number, minimumStock: number): ProductStockStatus {
  if (availableStock === 0) return "out";
  if (availableStock < minimumStock) return "low";
  return "normal";
}
