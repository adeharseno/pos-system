import { requireRole } from "@/modules/auth/application/auth-service";
import { apiSuccess } from "@/modules/shared/api/response";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { listPurchaseInvoices, savePurchaseInvoice } from "@/modules/purchasing/invoice-repository";

export function GET() {
  return invoiceEndpoint(async () => {
    await requireRole(["owner_admin"]);
    return apiSuccess((await listPurchaseInvoices()).rows);
  });
}
export function POST(request: Request) {
  return invoiceEndpoint(async () => {
    const employee = await requireRole(["owner_admin"]);
    return apiSuccess(await savePurchaseInvoice(request, employee.employeeId), 201);
  });
}
