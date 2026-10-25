import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/auth/application/auth-service";
import { requireResultObject, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { Json } from "@/types/database.types";
import { validateReportPeriod, type ReportPeriod } from "./sales-report";

export async function getProductPerformanceReport(period: ReportPeriod, sort: "quantity" | "revenue" = "quantity") {
  await requireRole(["owner_admin"]);
  validateReportPeriod(period);
  if (sort !== "quantity" && sort !== "revenue") throw new Error("INVALID_REPORT_SORT");
  const { data, error } = await createAdminSupabaseClient().rpc("product_performance_report", {
    p_from: period.from, p_to: period.to, p_sort: sort,
  });
  if (error) throw mapDatabaseError(error);
  if (data === null) throw new Error("REPORT_DATA_UNAVAILABLE");
  const result = requireResultObject(data);
  function rows(key: string) {
    const value = result[key];
    if (!Array.isArray(value)) throw new TypeError(`Invalid RPC result field: ${key}`);
    return value.map((row: Json) => requireResultObject(row));
  }
  return {
    period, sort,
    bestSelling: rows("bestSelling").map((row) => ({
      productId: resultString(row, "productId"), name: resultString(row, "name"), sku: resultString(row, "sku"),
      quantitySold: resultString(row, "quantitySold"), returnedQuantity: resultString(row, "returnedQuantity"),
      netQuantity: resultString(row, "netQuantity"), netRevenue: resultString(row, "netRevenue"),
    })),
    unsold: rows("unsold").map((row) => {
      if (typeof row.hasStock !== "boolean") throw new TypeError("Invalid RPC result field: hasStock");
      return { productId: resultString(row, "productId"), name: resultString(row, "name"), sku: resultString(row, "sku"),
        baseUnit: resultString(row, "baseUnit"), availableStock: resultString(row, "availableStock"), hasStock: row.hasStock };
    }),
  };
}
