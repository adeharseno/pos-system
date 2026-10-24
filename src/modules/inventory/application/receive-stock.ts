import "server-only";

import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import type { Json } from "@/types/database.types";

export type ReceiveStockBatch = { batchNumber: string; expiredDate: string; quantity: number; costPrice: number; receivedDate?: string };
export type ReceiveStockInput = { employeeId: string; productId: string; batches: ReceiveStockBatch[] };
export type ReceiveStockResult = { productId: string; batchCount: number };

export async function receiveStock(input: ReceiveStockInput): Promise<ReceiveStockResult> {
  const result = await callCoreRpc("receive_product_stock", {
    p_employee_id: input.employeeId,
    p_product_id: input.productId,
    p_batches: input.batches.map((batch) => ({
      batch_number: batch.batchNumber,
      expired_date: batch.expiredDate,
      quantity: batch.quantity,
      cost_price: batch.costPrice,
      ...(batch.receivedDate ? { received_date: batch.receivedDate } : {}),
    })) as Json,
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid receiving RPC result");
  const value = result as { product_id?: unknown; batch_count?: unknown };
  if (typeof value.product_id !== "string" || typeof value.batch_count !== "number") throw new Error("Invalid receiving RPC result");
  return { productId: value.product_id, batchCount: value.batch_count };
}
