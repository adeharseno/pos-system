import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { apiSuccess } from "@/modules/shared/api/response";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { writeInvoiceItem } from "@/modules/purchasing/invoice-item-repository";
type Context = { params: Promise<{ id: string; itemId: string }> };
function write(request: Request, context: Context, action: "update" | "delete") {
  return invoiceEndpoint(async () => { const actor = await requireRole(["owner_admin"]); const params = await context.params; return apiSuccess(await writeInvoiceItem(request, requireUuid(params.id, "invoice_id"), actor.employeeId, action, requireUuid(params.itemId, "item_id"))); });
}
export const PATCH = (request: Request, context: Context) => write(request, context, "update");
export const DELETE = (request: Request, context: Context) => write(request, context, "delete");
