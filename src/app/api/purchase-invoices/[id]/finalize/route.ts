import { requireRole } from "@/modules/auth/application/auth-service";
import { apiSuccess } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { finalizeReceiving, previewReceiving } from "@/modules/purchasing/receiving-finalization";
type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, { params }: Context) {
  return invoiceEndpoint(async () => { const actor = await requireRole(["owner_admin"]); return apiSuccess(await previewReceiving(requireUuid((await params).id,"invoice_id"),actor.employeeId)); });
}
export function POST(request: Request, { params }: Context) {
  return invoiceEndpoint(async () => { const actor = await requireRole(["owner_admin"]); return apiSuccess(await finalizeReceiving(request,requireUuid((await params).id,"invoice_id"),actor.employeeId)); });
}
