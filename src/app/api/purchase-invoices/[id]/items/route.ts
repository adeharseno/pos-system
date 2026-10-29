import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { apiSuccess } from "@/modules/shared/api/response";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { getPurchaseInvoice } from "@/modules/purchasing/invoice-repository";
import { listInvoiceItems, writeInvoiceItem } from "@/modules/purchasing/invoice-item-repository";
type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, { params }: Context) {
  return invoiceEndpoint(async () => { await requireRole(["owner_admin"]); const id = requireUuid((await params).id, "invoice_id"); await getPurchaseInvoice(id); return apiSuccess(await listInvoiceItems(id)); });
}
export function POST(request: Request, { params }: Context) {
  return invoiceEndpoint(async () => { const actor = await requireRole(["owner_admin"]); const id = requireUuid((await params).id, "invoice_id"); return apiSuccess(await writeInvoiceItem(request, id, actor.employeeId, "create"), 201); });
}
