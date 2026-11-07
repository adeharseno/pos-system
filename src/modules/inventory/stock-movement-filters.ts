export const stockMovementFilterTypes = [
  "sale", "void", "invoice", "customer_return", "supplier_return", "stock_opname", "manual_receiving",
] as const;

export type StockMovementFilterType = (typeof stockMovementFilterTypes)[number];
export type StockMovementFilters = { movementType?: StockMovementFilterType; startDate?: string; endDate?: string };

const calendarDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : undefined;
};

export function parseStockMovementFilters(input: { movementType?: string; startDate?: string; endDate?: string }): StockMovementFilters {
  const movementType = stockMovementFilterTypes.find(type => type === input.movementType);
  let startDate = calendarDate(input.startDate);
  let endDate = calendarDate(input.endDate);
  if (startDate && endDate && startDate > endDate) { startDate = undefined; endDate = undefined; }
  return { ...(movementType ? { movementType } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
}

export function stockMovementQuery(filters: StockMovementFilters, page?: number) {
  const query = new URLSearchParams();
  if (filters.movementType) query.set("movementType", filters.movementType);
  if (filters.startDate) query.set("startDate", filters.startDate);
  if (filters.endDate) query.set("endDate", filters.endDate);
  if (page && page > 1) query.set("movementPage", String(page));
  return query.toString();
}
