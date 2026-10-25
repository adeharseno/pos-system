import { requireRole } from "@/modules/auth/application/auth-service";
import { getActiveStockOpname } from "@/modules/inventory/application/stock-opname-service";
import { executeApi } from "@/modules/shared/api/response";

export async function GET() {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    return { session: await getActiveStockOpname() };
  });
}
