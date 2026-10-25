import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/auth/application/auth-service";
import { requireResultObject, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { validateReportPeriod, type ReportPeriod } from "./sales-report";

export async function getProfitLossReport(period: ReportPeriod) {
  await requireRole(["owner_admin"]);
  validateReportPeriod(period);
  const { data, error } = await createAdminSupabaseClient().rpc("profit_loss_report", {
    p_from: period.from, p_to: period.to,
  });
  if (error) throw mapDatabaseError(error);
  if (data === null) throw new Error("REPORT_DATA_UNAVAILABLE");
  const result = requireResultObject(data);
  const margin = result.grossMarginPercent;
  if (margin !== null && typeof margin !== "string") throw new TypeError("Invalid RPC result field: grossMarginPercent");
  return {
    period, currency: "IDR" as const,
    salesRevenue: resultString(result, "salesRevenue"),
    refunds: resultString(result, "refunds"),
    netRevenue: resultString(result, "netRevenue"),
    netCogs: resultString(result, "netCogs"),
    grossProfit: resultString(result, "grossProfit"),
    grossMarginPercent: margin,
    operatingExpenses: resultString(result, "operatingExpenses"),
    estimatedProfitAfterRecordedExpenses: resultString(result, "estimatedProfitAfterRecordedExpenses"),
    estimateLabel: "Estimasi Laba Setelah Biaya Tercatat",
    limitations: ["Estimasi hanya memperhitungkan biaya operasional yang sudah dicatat, bukan laba bersih final.", "Transaksi yang saat ini dibatalkan dikecualikan; laporan historis sebelum pembatalan tidak dapat direkonstruksi secara andal."],
  };
}
