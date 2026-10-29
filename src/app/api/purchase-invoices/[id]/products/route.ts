import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { apiSuccess } from "@/modules/shared/api/response";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { searchInvoiceProducts } from "@/modules/purchasing/invoice-item-repository";
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return invoiceEndpoint(async () => { await requireRole(["owner_admin"]); return apiSuccess(await searchInvoiceProducts(requireUuid((await params).id, "invoice_id"), new URL(request.url).searchParams.get("q"))); });
}
