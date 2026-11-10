import { requireRole } from "@/modules/auth/application/auth-service";
import { approveCustomerReturn } from "@/modules/returns/application/returns-service";
import { objectValue, optionalStringField, readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";
import type { ItemCondition } from "@/modules/returns/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin"]);
    const { id } = await params;
    const returnId = requireUuid(id, "returnId");
    const body = await readJsonObject(request);

    const adminNotes = stringField(body, "admin_notes").trim();
    if (!adminNotes) throw new TypeError("admin_notes is required");

    let itemConditions: Array<{ returnItemId: string; condition: ItemCondition }> | undefined;
    if (body.item_conditions && Array.isArray(body.item_conditions)) {
      itemConditions = body.item_conditions.map((raw, idx) => {
        const item = objectValue(raw, `item_conditions[${idx}]`);
        return {
          returnItemId: stringField(item, "return_item_id"),
          condition: (optionalStringField(item, "condition") ?? "good") as ItemCondition,
        };
      });
    }

    const confirmRefund = Boolean(body.confirm_refund);

    return approveCustomerReturn({
      employeeId: employee.employeeId,
      returnId,
      adminNotes,
      itemConditions,
      confirmRefund,
    });
  });
}
