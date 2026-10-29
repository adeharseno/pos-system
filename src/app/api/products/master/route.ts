import { requireRole } from "@/modules/auth/application/auth-service";
import { createMasterProduct } from "@/modules/catalog/application/create-master-product";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    return createMasterProduct(await request.json());
  }, 201);
}
