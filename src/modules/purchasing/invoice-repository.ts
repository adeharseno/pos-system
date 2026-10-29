import "server-only";
import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PosInputError } from "@/modules/shared/validation/input";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { INVOICE_BUCKET, parseInvoiceForm, validateInvoiceFile } from "./invoice-input";
import { invoiceDatabaseError, PurchaseInvoiceError } from "./invoice-errors";
import type { Json } from "@/types/database.types";
import { AuthApplicationError } from "@/modules/auth/errors";

export async function getPurchaseInvoice(id: string) {
  const result = await createAdminSupabaseClient().from("purchase_invoices")
    .select("*,suppliers(name),purchase_invoice_payments(amount,payment_key)").eq("id", id).maybeSingle();
  if (result.error) throw mapDatabaseError(result.error);
  if (!result.data) throw new PurchaseInvoiceError("PURCHASE_INVOICE_NOT_FOUND", 404, "Invoice tidak ditemukan.");
  return result.data;
}
export async function listPurchaseInvoices() {
  const result = await createAdminSupabaseClient().from("purchase_invoices")
    .select("id,invoice_number,invoice_date,total_amount,status,suppliers(name),purchase_invoice_payments(amount)")
    .order("created_at", { ascending: false }).limit(100);
  if (result.error) throw mapDatabaseError(result.error);
  return result.data;
}

export async function savePurchaseInvoice(request: Request, employeeId: string, editingId?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthApplicationError("FORBIDDEN");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 11 * 1024 * 1024) throw new PosInputError("Dokumen maksimal 10 MB.");
  const form = await request.formData();
  const input = parseInvoiceForm(form, Boolean(editingId));
  if (editingId && input.id !== editingId) throw new PosInputError("Invoice tidak sesuai.");
  const client = createAdminSupabaseClient();
  if (editingId && (await getPurchaseInvoice(editingId)).status !== "draft") throw new PurchaseInvoiceError("INVOICE_NOT_DRAFT", 409, "Invoice Selesai tidak dapat diubah.");
  const file = form.get("document");
  let document: { document_path: string; document_name: string; document_type: string } | undefined;
  if (file !== null && typeof file === "string") throw new PosInputError("Dokumen tidak valid.");
  if (file instanceof File && (file.size > 0 || file.name)) {
    if (file.size > 10 * 1024 * 1024) throw new PosInputError("Dokumen maksimal 10 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { type, extension } = validateInvoiceFile(file, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = `${input.id}/${input.requestId}-${hash}.${extension}`;
    const upload = await client.storage.from(INVOICE_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    // Retry uses immutable content-addressed names, never overwriting a prior document.
    if (upload.error && !["409", "Duplicate"].includes(String(upload.error.statusCode))) throw new PurchaseInvoiceError("INVOICE_UPLOAD_FAILED", 502, "Dokumen gagal diunggah. Coba kembali.");
    document = { document_path: path, document_name: file.name, document_type: type };
  }
  const result = await client.rpc("save_purchase_invoice_draft", {
    p_id: input.id, p_request_id: input.requestId, p_employee_id: employeeId,
    p_expected_version: input.version, p_payload: { ...input.payload, ...document } as Json,
  });
  // Do not delete files on uncertain RPC responses: the transaction may have committed.
  if (result.error) invoiceDatabaseError(result.error);
  return { id: input.id };
}

export async function downloadInvoiceDocument(id: string) {
  const invoice = await getPurchaseInvoice(id);
  if (!invoice.document_path) throw new PurchaseInvoiceError("INVOICE_DOCUMENT_NOT_FOUND", 404, "Invoice belum memiliki dokumen.");
  const result = await createAdminSupabaseClient().storage.from(INVOICE_BUCKET).download(invoice.document_path);
  if (result.error || !result.data) throw new PurchaseInvoiceError("INVOICE_DOCUMENT_UNAVAILABLE", 502, "Dokumen belum dapat dibuka. Coba kembali.");
  return new Response(result.data, { headers: {
    "Content-Type": invoice.document_type ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(invoice.document_name ?? "invoice")}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
