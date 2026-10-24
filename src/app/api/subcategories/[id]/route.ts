import { requireRole } from "@/modules/auth/application/auth-service";
import { editSubcategory, removeSubcategory } from "@/modules/catalog/application/create-category";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const categoryId = typeof body.category_id === "string" ? body.category_id : "";
    if (!name) throw new PosInputError("Subcategory name is required");
    return editSubcategory(requireUuid(id, "subcategory_id"), requireUuid(categoryId, "category_id"), name);
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const { id } = await params;
    return removeSubcategory(requireUuid(id, "subcategory_id"));
  });
}
