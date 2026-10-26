import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { getEmployee, writeEmployee, requireEmployeeManager } from "@/modules/auth/application/employee-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return executeApi(async () => getEmployee((await params).id)); }
export async function PATCH(request: Request, { params }: Context) { return executeApi(async () => {
 await requireEmployeeManager("employees.edit");
 return writeEmployee("edit", (await params).id, await readJsonObject(request));
}); }
