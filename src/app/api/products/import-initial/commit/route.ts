import { requireRole } from "@/modules/auth/application/auth-service";
import { commitInitialProductImport } from "@/modules/catalog/application/commit-initial-product-import";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

export async function POST(request: Request) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin"]);
    const form = await request.formData();
    const file = form.get("file"), requestId = form.get("request_id");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new PosInputError("Pilih file .xlsx maksimal 5 MB.");
    if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new PosInputError("Request ID tidak valid.");
    return commitInitialProductImport(await file.arrayBuffer(), file.name, requestId, employee.employeeId, form.get("acknowledge_warnings") === "true");
  });
}
