import { requireRole } from "@/modules/auth/application/auth-service";
import { apiSuccess } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { getPurchaseInvoice, savePurchaseInvoice } from "@/modules/purchasing/invoice-repository";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, { params }: Context) {
  return invoiceEndpoint(async () => {
    await requireRole(["owner_admin"]);
    const id = requireUuid((await params).id, "invoice_id");
    return apiSuccess(await getPurchaseInvoice(id));
  });
}
export function PATCH(request: Request, { params }: Context) {
  return invoiceEndpoint(async () => {
    const employee = await requireRole(["owner_admin"]);
    const id = requireUuid((await params).id, "invoice_id");
    return apiSuccess(await savePurchaseInvoice(request, employee.employeeId, id));
  });
}
