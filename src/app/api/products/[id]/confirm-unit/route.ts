import { requireRole } from "@/modules/auth/application/auth-service";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { executeApi } from "@/modules/shared/api/response";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin"]);
    const id = requireUuid((await context.params).id, "productId");
    const body = await request.json() as { unit?: unknown; sellingPrice?: unknown; expectedStock?: unknown };
    if (typeof body.unit !== "string" || !body.unit.trim() || typeof body.sellingPrice !== "number" || body.sellingPrice < 0 || !Number.isSafeInteger(body.expectedStock) || Number(body.expectedStock) < 0) throw new PosInputError("Data konfirmasi satuan tidak valid.");
    const client = createAdminSupabaseClient();
    const { data, error } = await client.rpc("confirm_initial_product_unit", { p_employee_id: employee.employeeId, p_product_id: id, p_unit_name: body.unit.trim(), p_selling_price: body.sellingPrice, p_expected_stock: Number(body.expectedStock) });
    if (error) throw mapDatabaseError(error);
    return data;
  });
}
