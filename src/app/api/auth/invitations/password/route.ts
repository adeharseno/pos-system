import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { setInvitationPassword } from "@/modules/auth/application/employee-service";
export async function POST(request: Request) { return executeApi(async () => setInvitationPassword(await readJsonObject(request))); }
