import { requireRole } from "@/modules/auth/application/auth-service";
import { commitProductImport } from "@/modules/catalog/application/commit-product-import";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const body = await request.json() as { rows?: unknown };
    return { results: await commitProductImport(body.rows) };
  });
}
