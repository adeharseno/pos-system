import { requireRole } from "@/modules/auth/application/auth-service";
import { rejectCustomerReturn } from "@/modules/returns/application/returns-service";
import { readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";

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

    return rejectCustomerReturn({
      employeeId: employee.employeeId,
      returnId,
      adminNotes,
    });
  });
}

