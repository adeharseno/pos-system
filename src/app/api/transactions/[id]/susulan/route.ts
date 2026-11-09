import { requireAllPermissions } from "@/modules/auth/application/auth-service";
import { readJsonObject, arrayField, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";
import { insertSusulanItems } from "@/modules/sales/data/bpjs-susulan-queries";

/**
 * POST /api/transactions/[id]/susulan
 * Idempotently inserts BPJS susulan items for a completed transaction.
 * Body: { delivery_date: string, items: Array<{drug_name, quantity, unit_price, request_key}> }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeApi(async () => {
    const employee = await requireAllPermissions(["cashier.view", "sales.checkout"]);
    const { id: transactionId } = await params;
    const body = await readJsonObject(request);
    const deliveryDate = stringField(body, "delivery_date");
    const rawItems = arrayField(body, "items");

    if (rawItems.length === 0) throw new PosInputError("items must not be empty");

    const items = rawItems.map((raw, index) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        throw new PosInputError(`items[${index}] must be an object`);
      const item = raw as Record<string, unknown>;
      const drugName = typeof item.drug_name === "string" ? item.drug_name.trim() : "";
      if (!drugName) throw new PosInputError(`items[${index}].drug_name required`);
      const quantity = typeof item.quantity === "number" ? item.quantity : NaN;
      if (!Number.isInteger(quantity) || quantity < 1)
        throw new PosInputError(`items[${index}].quantity must be a positive integer`);
      const unitPrice = typeof item.unit_price === "number" ? item.unit_price : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        throw new PosInputError(`items[${index}].unit_price must be >= 0`);
      const requestKey = typeof item.request_key === "string" ? item.request_key.trim() : "";
      if (!requestKey) throw new PosInputError(`items[${index}].request_key required`);
      return { drugName, quantity, unitPrice, requestKey };
    });

    await insertSusulanItems(transactionId, employee.employeeId, deliveryDate, items);
    return { inserted: items.length };
  }, 201);
}

