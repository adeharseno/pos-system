import { requireRole } from "@/modules/auth/application/auth-service";
import { apiSuccess } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { recordPurchaseInvoicePayment } from "@/modules/purchasing/invoice-repository";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return invoiceEndpoint(async () => {
    const actor = await requireRole(["owner_admin"]);
    return apiSuccess(await recordPurchaseInvoicePayment(request, requireUuid((await params).id, "invoice_id"), actor.employeeId), 201);
  });
}
