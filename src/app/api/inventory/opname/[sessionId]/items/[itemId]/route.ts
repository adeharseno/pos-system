import { requireRole } from "@/modules/auth/application/auth-service";
import { updateStockOpnameItem } from "@/modules/inventory/application/stock-opname-service";
import { numberField, optionalStringField, readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string; itemId: string }> }) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const [{ sessionId, itemId }, body] = await Promise.all([params, readJsonObject(request)]);
    return updateStockOpnameItem({
      sessionId,
      itemId,
      physicalQuantity: numberField(body, "physical_quantity"),
      notes: optionalStringField(body, "notes"),
    });
  });
}
