import { requireRole } from "@/modules/auth/application/auth-service";
import { saveSupplier, removeSupplier } from "@/modules/catalog/data/supplier-repository";
import { parseSupplierInput } from "@/modules/catalog/supplier-input";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const id = requireUuid((await params).id, "ID pemasok");
    return saveSupplier(parseSupplierInput(await request.json()), id);
  });
}
export async function DELETE(_request: Request, { params }: Context) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    return removeSupplier(requireUuid((await params).id, "ID pemasok"));
  });
}
