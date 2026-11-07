export type StockMovementRow = {
  eventId: string;
  occurredAt: string;
  type: "in" | "out" | "void" | "customer_return" | "supplier_return" | "stock_opname_in" | "stock_opname_out" | "manual_receiving";
  quantity: number;
  unit: string;
  employeeName: string | null;
  supplierName: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
  batchNumber?: string | null;
  reason?: string | null;
};

export function formatStockMovementWib(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short", hour12: false,
  }).format(new Date(value)).replace(" pukul ", " · ");
}

const nullableString = (value: unknown) => value === null || typeof value === "string";

export function parseStockMovementReadModel(value: unknown): { rows: StockMovementRow[]; total: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid stock movement result");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || Number(result.total) < 0) throw new TypeError("Invalid stock movement result");
  const rows = result.rows.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Invalid stock movement row");
    const row = item as Record<string, unknown>;
    if (typeof row.eventId !== "string" || !/^(sale|receipt|void|customer-return|supplier-return|stock-opname|manual-receiving):[0-9a-f-]{36}$/.test(row.eventId)
      || typeof row.occurredAt !== "string" || Number.isNaN(Date.parse(row.occurredAt))
      || (row.type !== "in" && row.type !== "out" && row.type !== "void" && row.type !== "customer_return" && row.type !== "supplier_return" && row.type !== "stock_opname_in" && row.type !== "stock_opname_out" && row.type !== "manual_receiving")
      || !Number.isSafeInteger(row.quantity) || Number(row.quantity) <= 0
      || typeof row.unit !== "string" || !nullableString(row.employeeName) || !nullableString(row.supplierName)
      || !nullableString(row.referenceNumber) || !nullableString(row.referenceUrl)
      || (row.batchNumber !== undefined && !nullableString(row.batchNumber)) || (row.reason !== undefined && !nullableString(row.reason))
      || ((row.type === "out" || row.type === "void" || row.type === "customer_return") && (typeof row.referenceNumber !== "string" || typeof row.referenceUrl !== "string" || !/^\/transactions\/[0-9a-f-]{36}$/.test(row.referenceUrl)))
      || (row.type === "in" && (typeof row.referenceNumber !== "string" || typeof row.referenceUrl !== "string" || !/^\/purchase-invoices\/[0-9a-f-]{36}$/.test(row.referenceUrl)))
      || (row.type === "supplier_return" && row.referenceUrl !== null)
      || ((row.type === "stock_opname_in" || row.type === "stock_opname_out") && row.referenceUrl !== null)
      || (row.type === "manual_receiving" && (row.referenceUrl !== null || typeof row.batchNumber !== "string" || !row.batchNumber))) {
      throw new TypeError("Invalid stock movement row");
    }
    return row as StockMovementRow;
  });
  return { rows, total: Number(result.total) };
}
