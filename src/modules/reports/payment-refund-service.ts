import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/auth/application/auth-service";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { validateReportPeriod, type ReportPeriod } from "./sales-report";

export async function getPaymentRefundReport(period: ReportPeriod) {
  await requireRole(["owner_admin"]);
  validateReportPeriod(period);
  const { data, error } = await createAdminSupabaseClient().rpc("payment_refund_report", {
    p_from: period.from, p_to: period.to,
  });
  if (error) throw mapDatabaseError(error);
  if (data === null) throw new Error("REPORT_DATA_UNAVAILABLE");
  const result = requireResultObject(data);
  if (!Array.isArray(result.methods)) throw new TypeError("Invalid RPC result field: methods");
  const methods = result.methods.map((item) => {
    const row = requireResultObject(item);
    const method = resultString(row, "method");
    if (method !== "cash" && method !== "qris" && method !== "bank_transfer") {
      throw new TypeError("Invalid RPC payment method");
    }
    return {
      method,
      completedCount: resultNumber(row, "completedCount"),
      paymentsReceived: resultString(row, "paymentsReceived"),
      customerRefunds: resultString(row, "customerRefunds"),
      netPayments: resultString(row, "netPayments"),
      pendingCount: resultNumber(row, "pendingCount"),
      pendingAmount: resultString(row, "pendingAmount"),
    };
  });
  return {
    period, currency: "IDR" as const, methods,
    pendingBasis: "Pembayaran yang masih menunggu berdasarkan tanggal transaksi; status menunggu pada masa lalu tidak dapat direkonstruksi.",
    limitations: ["Transaksi yang saat ini dibatalkan dikecualikan; laporan historis sebelum pembatalan tidak dapat direkonstruksi secara andal."],
  };
}
