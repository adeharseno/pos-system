import { requireRole } from "@/modules/auth/application/auth-service";
import { approveCustomerReturn } from "@/modules/returns/application/returns-service";
import { optionalStringField, readJsonObject } from "@/modules/shared/api/input";
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
    let adminNotes = "Disetujui";
    try {
      const body = await readJsonObject(request);
      const raw = optionalStringField(body, "admin_notes");
      if (raw && raw.trim()) adminNotes = raw.trim();
    } catch {
      // Body is optional on approve
    }

    return approveCustomerReturn({
      employeeId: employee.employeeId,
      returnId,
      adminNotes,
    });
  });
}
