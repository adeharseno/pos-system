import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { inviteEmployee, requireEmployeeManager } from "@/modules/auth/application/employee-service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return executeApi(async () => {
 await requireEmployeeManager("employees.invite");
 return inviteEmployee((await params).id, await readJsonObject(request));
}); }
