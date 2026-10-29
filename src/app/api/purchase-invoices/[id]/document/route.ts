import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { invoiceEndpoint } from "@/modules/purchasing/invoice-api";
import { downloadInvoiceDocument } from "@/modules/purchasing/invoice-repository";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return invoiceEndpoint(async () => {
    await requireRole(["owner_admin"]);
    return downloadInvoiceDocument(requireUuid((await params).id, "invoice_id"));
  });
}
