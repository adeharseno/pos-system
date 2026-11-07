import * as XLSX from "xlsx";

import type { StockMovementRow } from "./data/stock-movement-read-model-parser";

export const STOCK_MOVEMENT_EXPORT_LIMIT = 10_000;
export const STOCK_MOVEMENT_EXPORT_PAGE_SIZE = 100;

export class StockMovementExportError extends Error {
  constructor(public readonly code: "EMPTY" | "LIMIT" | "CHANGED") {
    super(code);
    this.name = "StockMovementExportError";
  }
}

export async function collectStockMovementExport(
  fetchPage: (page: number, limit: number) => Promise<{ rows: StockMovementRow[]; total: number }>,
  maximum = STOCK_MOVEMENT_EXPORT_LIMIT,
) {
  const first = await fetchPage(1, STOCK_MOVEMENT_EXPORT_PAGE_SIZE);
  if (first.total === 0) throw new StockMovementExportError("EMPTY");
  if (first.total > maximum) throw new StockMovementExportError("LIMIT");
  const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page += 1) {
    const result = await fetchPage(page, STOCK_MOVEMENT_EXPORT_PAGE_SIZE);
    if (result.total !== first.total || result.rows.length === 0) throw new StockMovementExportError("CHANGED");
    rows.push(...result.rows);
    if (rows.length > maximum) throw new StockMovementExportError("LIMIT");
  }
  if (rows.length !== first.total) throw new StockMovementExportError("CHANGED");
  if (new Set(rows.map(row => row.eventId)).size !== rows.length) throw new StockMovementExportError("CHANGED");
  return rows;
}

const movementLabel = (type: StockMovementRow["type"]) => ({
  out: "Penjualan", void: "Void", in: "Penerimaan Invoice", customer_return: "Retur Pelanggan",
  supplier_return: "Retur Pemasok", stock_opname_in: "Stock Opname", stock_opname_out: "Stock Opname",
  manual_receiving: "Tambah Stok Manual",
})[type];

const incoming = (type: StockMovementRow["type"]) =>
  type !== "out" && type !== "supplier_return" && type !== "stock_opname_out";

export function safeSpreadsheetText(value: string | null | undefined) {
  if (!value) return "-";
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function wibParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return { date: `${part("day")}/${part("month")}/${part("year")}`, time: `${part("hour")}:${part("minute")}:${part("second")}` };
}

export function buildStockMovementWorkbook(rows: StockMovementRow[], product: { name: string; sku: string }) {
  const headers = ["Tanggal (WIB)", "Waktu (WIB)", "Jenis Pergerakan", "Barang Masuk", "Barang Keluar", "Satuan", "Nama Produk", "SKU", "Batch", "Petugas/Kasir", "Pemasok", "Referensi", "Alasan/Keterangan"];
  const values = rows.map(row => {
    const time = wibParts(row.occurredAt);
    return [
      time.date, time.time, movementLabel(row.type), incoming(row.type) ? row.quantity : 0,
      incoming(row.type) ? 0 : row.quantity, safeSpreadsheetText(row.unit), safeSpreadsheetText(product.name),
      safeSpreadsheetText(product.sku), safeSpreadsheetText(row.batchNumber), safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.supplierName), safeSpreadsheetText(row.referenceNumber), safeSpreadsheetText(row.reason),
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...values]);
  sheet["!cols"] = [12, 12, 23, 14, 14, 14, 28, 18, 20, 24, 24, 24, 32].map(wch => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Riwayat Stok");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function stockMovementExportFilename(sku: string, date: string) {
  const safeSku = sku.trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || "produk";
  return `riwayat-stok-${safeSku}-${date}.xlsx`;
}
