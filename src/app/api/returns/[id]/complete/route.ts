import { requireRole } from "@/modules/auth/application/auth-service";
import { completeCustomerReturn } from "@/modules/returns/application/returns-service";
import { objectValue, optionalStringField, readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
import type { ItemCondition } from "@/modules/returns/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin", "kasir"]);
    const { id } = await params;
    const returnId = requireUuid(id, "returnId");

    let itemConditions: Array<{ returnItemId: string; condition: ItemCondition }> | undefined;
    try {
      const body = await readJsonObject(request);
      if ("item_conditions" in body && Array.isArray(body.item_conditions)) {
        itemConditions = (body.item_conditions as unknown[]).map((raw: unknown, idx: number) => {
          const item = objectValue(raw, `item_conditions[${idx}]`);
          return {
            returnItemId: stringField(item, "return_item_id"),
            condition: (optionalStringField(item, "condition") ?? "good") as ItemCondition,
          };
        });
      }
    } catch {
      // Body is optional for complete
    }

    return completeCustomerReturn({
      employeeId: employee.employeeId,
      returnId,
      itemConditions,
    });
  });
}
