import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireAllPermissions } from "@/modules/auth/application/auth-service";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { parseStockMovementReadModel } from "./stock-movement-read-model-parser";
import type { StockMovementFilters } from "../stock-movement-filters";
export { formatStockMovementWib } from "./stock-movement-read-model-parser";
export type { StockMovementRow } from "./stock-movement-read-model-parser";

type RpcResult = { data: unknown; error: { message: string } | null };
type MovementRpc = (name: "product_stock_movement_read_model", args: Record<string, unknown>) => PromiseLike<RpcResult>;

export async function listProductStockMovements(productId: string, page: number, limit = 20, filters: StockMovementFilters = {}) {
  await requireAllPermissions(["inventory.view", "transactions.view"]);
  const client = createAdminSupabaseClient();
  const rpc = client.rpc.bind(client) as unknown as MovementRpc;
  const { data, error } = await rpc("product_stock_movement_read_model", {
    p_product_id: productId, p_page: page, p_limit: limit,
    p_movement_type: filters.movementType ?? null,
    p_start_date: filters.startDate ?? null,
    p_end_date: filters.endDate ?? null,
  });
  if (error) throw mapDatabaseError(error);
  return parseStockMovementReadModel(data);
}
