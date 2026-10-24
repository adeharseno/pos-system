import { requireRole } from "@/modules/auth/application/auth-service";
import { createCategory } from "@/modules/catalog/application/create-category";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new PosInputError("Category name is required");
    return createCategory(name);
  }, 201);
}
