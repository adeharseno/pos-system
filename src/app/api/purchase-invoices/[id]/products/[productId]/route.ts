import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { apiSuccess } from "@/modules/shared/api/response";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { getInvoiceProduct } from "@/modules/purchasing/invoice-item-repository";
export function GET(_request: Request, { params }: { params: Promise<{ id: string; productId: string }> }) {
  return invoiceEndpoint(async () => { await requireRole(["owner_admin"]); const data = await params; return apiSuccess(await getInvoiceProduct(requireUuid(data.id, "invoice_id"), requireUuid(data.productId, "product_id"))); });
}
