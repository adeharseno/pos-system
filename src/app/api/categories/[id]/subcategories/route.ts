import { requireRole } from "@/modules/auth/application/auth-service";
import { createSubcategory } from "@/modules/catalog/application/create-category";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new PosInputError("Subcategory name is required");
    return createSubcategory(requireUuid(id, "category_id"), name);
  }, 201);
}
