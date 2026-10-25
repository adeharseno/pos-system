import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/auth/application/auth-service";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { validateReportPeriod, type ReportPeriod } from "./sales-report";

// Authorization is required before calling the service-role-only RPC.
export async function getSalesGrossProfitReport(period: ReportPeriod) {
  await requireRole(["owner_admin"]);
  validateReportPeriod(period);
  const { data, error } = await createAdminSupabaseClient().rpc("sales_gross_profit_report", {
    p_from: period.from, p_to: period.to,
  });
  if (error) throw mapDatabaseError(error);
  if (data === null) throw new Error("REPORT_DATA_UNAVAILABLE");
  const result = requireResultObject(data);
  const margin = result.grossMarginPercent;
  if (margin !== null && typeof margin !== "string") throw new TypeError("Invalid RPC result field: grossMarginPercent");
  return {
    period,
    currency: "IDR" as const,
    completedTransactionCount: resultNumber(result, "completedTransactionCount"),
    salesRevenue: resultString(result, "salesRevenue"),
    salesTax: resultString(result, "salesTax"),
    refunds: resultString(result, "refunds"),
    refundedTax: resultString(result, "refundedTax"),
    netRevenue: resultString(result, "netRevenue"),
    cogs: resultString(result, "cogs"),
    returnedCogs: resultString(result, "returnedCogs"),
    grossProfit: resultString(result, "grossProfit"),
    grossMarginPercent: margin,
    limitations: ["Transaksi yang saat ini dibatalkan dikecualikan; laporan historis sebelum pembatalan tidak dapat direkonstruksi secara andal."],
  };
}
