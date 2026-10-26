import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { writeEmployee, requireEmployeeManager } from "@/modules/auth/application/employee-service";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return executeApi(async () => {
 await requireEmployeeManager("employees.edit");
 return writeEmployee("role", (await params).id, await readJsonObject(request));
}); }
