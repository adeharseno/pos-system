import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { getEmployeePermissions, updateEmployeePermission, requireEmployeeManager } from "@/modules/auth/application/employee-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return executeApi(async () => getEmployeePermissions((await params).id)); }
export async function PATCH(request: Request, { params }: Context) { return executeApi(async () => {
 await requireEmployeeManager("permissions.manage");
 return updateEmployeePermission((await params).id, await readJsonObject(request));
}); }
