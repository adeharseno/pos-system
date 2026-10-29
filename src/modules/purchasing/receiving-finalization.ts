import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { AuthApplicationError } from "@/modules/auth/errors";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { invoiceDatabaseError } from "./invoice-errors";
import type { ReceivingPreview } from "./receiving-types";

export async function previewReceiving(invoiceId: string, employeeId: string) {
  const result = await createAdminSupabaseClient().rpc("preview_purchase_receiving", { p_invoice_id: invoiceId, p_employee_id: employeeId });
  if (result.error) invoiceDatabaseError(result.error);
  return result.data as unknown as ReceivingPreview;
}
export async function finalizeReceiving(request: Request, invoiceId: string, employeeId: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthApplicationError("FORBIDDEN");
  const body = await request.json() as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version<1 || typeof body.token !== "string" || !/^[a-f0-9]{32}$/.test(body.token) || typeof body.acknowledge_difference !== "boolean") throw new PosInputError("Konfirmasi penerimaan tidak valid.");
  const requestId = requireUuid(typeof body.request_id === "string" ? body.request_id : "", "request_id");
  const result = await createAdminSupabaseClient().rpc("finalize_purchase_receiving", { p_invoice_id: invoiceId, p_employee_id: employeeId, p_request_id: requestId, p_expected_version: body.version, p_token: body.token, p_acknowledge_difference: body.acknowledge_difference });
  if (result.error) invoiceDatabaseError(result.error);
  return { id: invoiceId, status: "completed" };
}
export async function getReceivingReceipts(invoiceId: string) {
  const result = await createAdminSupabaseClient().from("purchase_invoice_receipts").select("*").eq("invoice_id", invoiceId).order("received_at").order("item_id");
  if (result.error) throw mapDatabaseError(result.error);
  return result.data;
}
