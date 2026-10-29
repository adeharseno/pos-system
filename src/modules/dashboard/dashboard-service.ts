import "server-only";
import { cache } from "react";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRequestEmployee } from "@/modules/auth/application/request-employee";
import { loadPermissions } from "@/modules/auth/data/permission-repository";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { Json } from "@/types/database.types";
import { authorizedDashboardRead, canReadDashboardFinancials, canReadDashboardStock, cents, dashboardActions, dashboardLowStockRows, dateLabel, rupiah, type ChartPoint, type DashboardFilters } from "./dashboard-model";
import { inventoryBusinessDate } from "@/modules/inventory/inventory-rules";

export const getDashboardContext = cache(async () => {
  const employee = await requireRequestEmployee();
  const permissions = await loadPermissions(employee.employeeId, employee.role);
  return { employee, permissions, financial: canReadDashboardFinancials(employee.role, permissions), stock: canReadDashboardStock(employee.role, permissions), actions: dashboardActions(employee.role, permissions) };
});

export async function getDashboardLowStock() {
  const { employee, permissions } = await getDashboardContext();
  if (!canReadDashboardStock(employee.role, permissions)) throw new Error("FORBIDDEN");
  const { data, error } = await createAdminSupabaseClient().rpc("dashboard_low_stock", { p_business_date: inventoryBusinessDate() });
  if (error) throw mapDatabaseError(error);
  return dashboardLowStockRows(data);
}

export async function getDashboardAnalytics(filters: DashboardFilters) {
  const { employee, permissions } = await getDashboardContext();
  return authorizedDashboardRead(employee.role, permissions, async () => {
    const { data, error } = await createAdminSupabaseClient().rpc("dashboard_analytics_report", {
      p_from: filters.period.from, p_to: filters.period.to, p_year: filters.year,
    });
    if (error) throw mapDatabaseError(error);
    if (data === null) throw new Error("REPORT_DATA_UNAVAILABLE");
    return dashboardPresentation(data);
  });
}

function rows(result: Record<string, Json | undefined>, key: string) {
  const value = result[key];
  if (!Array.isArray(value)) throw new TypeError(`Invalid dashboard rows: ${key}`);
  return value.map(requireResultObject);
}

// All money calculations and exact labels stay on the server, just like /reports.
function dashboardPresentation(data: Json) {
  const result = requireResultObject(data);
  const summary = requireResultObject(result.summary ?? null);
  const money = (key: string) => rupiah(cents(resultString(summary, key)));
  const margin = summary.grossMarginPercent;
  if (margin !== null && typeof margin !== "string") throw new TypeError("Invalid report margin");
  const metrics = [
    { label: "Penjualan Bersih", value: money("netRevenue"), hint: "Penjualan dikurangi retur, sebelum pajak", icon: "sales" },
    { label: "Jumlah Transaksi", value: resultNumber(summary, "completedTransactionCount").toLocaleString("id-ID"), hint: "Transaksi dengan pembayaran selesai", icon: "transactions" },
    { label: "Total Retur", value: money("refunds"), hint: "Retur pelanggan, sebelum pajak", icon: "returns" },
    { label: "Laba Kotor", value: money("grossProfit"), hint: "Belum dikurangi biaya operasional", icon: "profit" },
    { label: "Total Penjualan (sebelum pajak)", value: money("salesRevenue"), hint: "Penjualan sebelum pengurangan retur", icon: "sales" },
    { label: "HPP Bersih", value: rupiah(cents(resultString(summary, "cogs")) - cents(resultString(summary, "returnedCogs"))), hint: "HPP penjualan dikurangi HPP retur", icon: "cost" },
    { label: "Margin Laba Kotor", value: margin === null ? "Tidak berlaku" : `${margin.replace(".", ",")}%`, hint: "Tidak berlaku jika penjualan bersih nol", icon: "profit" },
    { label: "Pajak Bersih", value: rupiah(cents(resultString(summary, "salesTax")) - cents(resultString(summary, "refundedTax"))), hint: "Pajak penjualan dikurangi pajak retur", icon: "tax" },
  ];
  const series = (key: string, monthly: boolean): ChartPoint[] => rows(result, key).map(row => ({
    label: dateLabel(resultString(row, "date"), monthly),
    value: Number(resultString(row, "revenue")),
    display: rupiah(cents(resultString(row, "revenue"))), count: resultNumber(row, "count"),
  }));
  const payments: ChartPoint[] = rows(result, "payments").filter(row => resultNumber(row, "completedCount") > 0).map(row => {
    const method = resultString(row, "method");
    if (!["cash", "qris", "bank_transfer"].includes(method)) throw new TypeError("Invalid payment method");
    return { label: method === "cash" ? "Tunai" : method === "qris" ? "QRIS" : "Transfer Bank", value: Number(resultString(row, "paymentsReceived")), display: rupiah(cents(resultString(row, "paymentsReceived"))), count: resultNumber(row, "completedCount") };
  });
  const products = rows(result, "products").map(row => ({
    id: resultString(row, "productId"), name: resultString(row, "name"), sku: resultString(row, "sku"),
    quantity: BigInt(resultString(row, "netQuantity")).toLocaleString("id-ID"),
    revenue: rupiah(cents(resultString(row, "netRevenue"))),
  }));
  return { metrics, monthly: series("monthly", true), daily: series("daily", false), payments, products };
}
