import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { BpjsSusulanItem, BpjsSusulanNotification } from "../bpjs-susulan";

function mapRow(row: Record<string, unknown>): BpjsSusulanItem {
  return {
    id: row.id as string,
    transactionId: row.transaction_id as string,
    productId: (row.product_id as string) ?? null,
    drugName: row.drug_name as string,
    quantity: row.quantity as number,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    deliveryDate: row.delivery_date as string,
    fulfillmentStatus: row.fulfillment_status as BpjsSusulanItem["fulfillmentStatus"],
    fulfilledBy: row.fulfilled_by as string | null,
    fulfilledAt: row.fulfilled_at as string | null,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    requestKey: row.request_key as string,
  };
}

/** Fetch all susulan items for a given transaction, ordered by creation time. */
export async function getSusulanItemsForTransaction(transactionId: string): Promise<BpjsSusulanItem[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("bpjs_susulan_items")
    .select("id,transaction_id,product_id,drug_name,quantity,unit_price,line_total,delivery_date,fulfillment_status,fulfilled_by,fulfilled_at,created_at,created_by,request_key")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true });
  if (error) throw mapDatabaseError(error);
  return (data ?? []).map(mapRow);
}

/** Count pending susulan items across all transactions. */
export async function countPendingSusulanItems(): Promise<number> {
  const { count, error } = await createAdminSupabaseClient()
    .from("bpjs_susulan_items")
    .select("id", { count: "exact", head: true })
    .eq("fulfillment_status", "pending_fulfillment");
  if (error) throw mapDatabaseError(error);
  return count ?? 0;
}

/** Get pending susulan items grouped by transaction for admin notifications. */
export async function getPendingSusulanNotifications(): Promise<BpjsSusulanNotification[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("bpjs_susulan_items")
    .select(`
      transaction_id,
      transactions!inner (
        invoice_number,
        transaction_prescriptions (
          patient_name
        )
      )
    `)
    .eq("fulfillment_status", "pending_fulfillment");

  if (error) throw mapDatabaseError(error);
  if (!data || data.length === 0) return [];

  type NotificationRow = {
    transaction_id: string;
    transactions: {
      invoice_number: string;
      transaction_prescriptions: Array<{ patient_name: string | null }> | null;
    } | null;
  };

  const map = new Map<string, { invoiceNumber: string; patientName: string | null; count: number }>();
  for (const item of (data as unknown as NotificationRow[])) {
    const txId = item.transaction_id;
    const tx = item.transactions;
    const invoiceNumber = tx?.invoice_number ?? "-";
    const patientName = tx?.transaction_prescriptions?.[0]?.patient_name ?? null;

    const existing = map.get(txId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(txId, { invoiceNumber, patientName, count: 1 });
    }
  }

  return Array.from(map.entries()).map(([transactionId, info]) => ({
    transactionId,
    invoiceNumber: info.invoiceNumber,
    patientName: info.patientName,
    pendingCount: info.count,
  }));
}

/** Insert susulan items via RPC (idempotent). */
export async function insertSusulanItems(
  transactionId: string,
  employeeId: string,
  deliveryDate: string,
  items: Array<{ drugName: string; quantity: number; unitPrice: number; requestKey: string }>
): Promise<void> {
  const { error } = await createAdminSupabaseClient().rpc("insert_bpjs_susulan_items", {
    p_transaction_id: transactionId,
    p_employee_id: employeeId,
    p_delivery_date: deliveryDate,
    p_items: items.map((it) => ({
      drug_name: it.drugName,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      request_key: it.requestKey,
    })),
  });
  if (error) throw mapDatabaseError(error);
}

/** Fulfill (mark completed) a single susulan item. Only owner_admin may call. */
export async function fulfillSusulanItem(
  susulanId: string,
  employeeId: string,
  productId?: string | null
): Promise<void> {
  const { error } = await createAdminSupabaseClient().rpc("fulfill_bpjs_susulan_item", {
    p_susulan_id: susulanId,
    p_employee_id: employeeId,
    p_product_id: productId ?? null,
  });
  if (error) throw mapDatabaseError(error);
}
