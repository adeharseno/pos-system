import { executeEmployeeApi as executeApi } from "@/modules/auth/employee-api";
import { readJsonObject } from "@/modules/shared/api/input";
import { acceptInvitationToken } from "@/modules/auth/application/employee-service";
import { allowedKeys } from "@/modules/auth/employee-validation";
export async function POST(request: Request) { return executeApi(async () => {
 const body = await readJsonObject(request); allowedKeys(body, ["token_hash", "type"]);
 return acceptInvitationToken(body.token_hash, body.type);
}); }
