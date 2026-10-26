import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { listEmployees, writeEmployee, requireEmployeeManager } from "@/modules/auth/application/employee-service";
export async function GET(request: Request) { return executeApi(() => listEmployees(new URL(request.url).searchParams)); }
export async function POST(request: Request) { return executeApi(async () => {
 await requireEmployeeManager("employees.create");
 return writeEmployee("create", null, await readJsonObject(request));
}, 201); }
