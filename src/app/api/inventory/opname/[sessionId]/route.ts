import { requireRole } from "@/modules/auth/application/auth-service";
import { getStockOpname } from "@/modules/inventory/application/stock-opname-service";
import { executeApi } from "@/modules/shared/api/response";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const { sessionId } = await params;
    const session = await getStockOpname(sessionId);
    if (!session) throw new PosDomainError("STOCK_OPNAME_NOT_FOUND");
    return { session };
  });
}
