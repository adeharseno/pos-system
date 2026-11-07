import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { StockStatus } from "@/modules/shared/stock-status";
import { parseStockListReadModel } from "./stock-list-read-model-parser";
export type { StockListRow } from "./stock-list-read-model-parser";

export type StockListFilters = {
  businessDate: string;
  q?: string;
  activeStatus?: "all" | "active" | "inactive";
  prescriptionStatus?: "all" | "required" | "non_prescription";
  stockStatus?: "all" | StockStatus | "needs_restock";
  sort?: "name_asc" | "stock_asc" | "stock_desc" | "expiry_asc";
  page: number;
  limit: number;
};

type RpcResult = { data: unknown; error: { message: string } | null };
type StockListRpc = (name: "stock_list_read_model", args: Record<string, unknown>) => PromiseLike<RpcResult>;

export async function listStockReadModel(filters: StockListFilters) {
  const client = createAdminSupabaseClient();
  const rpc = client.rpc.bind(client) as unknown as StockListRpc;
  const { data, error } = await rpc("stock_list_read_model", {
    p_business_date: filters.businessDate, p_query: filters.q ?? "",
    p_active_status: filters.activeStatus ?? "all",
    p_prescription_status: filters.prescriptionStatus ?? "all",
    p_stock_status: filters.stockStatus ?? "all", p_sort: filters.sort ?? "name_asc",
    p_page: filters.page, p_limit: filters.limit,
  });
  if (error) throw mapDatabaseError(error);
  return parseStockListReadModel(data);
}
