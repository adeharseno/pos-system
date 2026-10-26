import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EmployeeManagementError, EMPLOYEE_ERRORS, type EmployeeErrorCode } from "../employee-errors";
import { PosDataAccessError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError } from "@/modules/shared/validation/input";
import type { Json } from "@/types/database.types";
import type { InvitationClaim } from "../application/invitation-workflow";

type EmployeeRpc = "employee_admin_read" | "employee_admin_write" | "employee_permission_read" |
  "employee_invitation_command" | "employee_invitation_accept" | "employee_account_access" |
  "set_employee_permission_override";

export async function employeeRpc(name: EmployeeRpc, args: Record<string, Json | undefined>): Promise<Json | null> {
  const client = createAdminSupabaseClient();
  const rpc = client.rpc.bind(client) as unknown as
    (name: EmployeeRpc, args: Record<string, Json | undefined>) => Promise<{ data: Json | null; error: { message: string; code?: string } | null }>;
  const result = await rpc(name, args);
  if (result.error) {
    if (Object.hasOwn(EMPLOYEE_ERRORS, result.error.message)) throw new EmployeeManagementError(result.error.message as EmployeeErrorCode);
    if (result.error.code?.startsWith("22")) throw new PosInputError("invalid employee input");
    throw new PosDataAccessError(result.error);
  }
  return result.data;
}

export function invitationClaim(value: Json | null): InvitationClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid invitation result");
  const { employee_id, auth_user_id, email, attempt_id, status } = value;
  if ([employee_id, auth_user_id, email, attempt_id, status].some(field => typeof field !== "string")) throw new Error("Invalid invitation result");
  return { employee_id: employee_id as string, auth_user_id: auth_user_id as string,
    email: email as string, attempt_id: attempt_id as string, status: status as string };
}

export async function ensureInvitationUser(claim: InvitationClaim) {
  const admin = createAdminSupabaseClient().auth.admin;
  const existing = await admin.getUserById(claim.auth_user_id);
  if (existing.data.user) {
    if (existing.data.user.email?.toLowerCase() !== claim.email) throw new EmployeeManagementError("EMAIL_CONFLICT");
    return;
  }
  if (existing.error && existing.error.status !== 404 && existing.error.code !== "user_not_found") throw new EmployeeManagementError("PROVISIONING_FAILED");
  const created = await admin.createUser({ id: claim.auth_user_id, email: claim.email, email_confirm: false });
  if (created.error) {
    // Creation may have committed even if the caller lost its response.
    const recovered = await admin.getUserById(claim.auth_user_id);
    if (recovered.data.user?.email?.toLowerCase() === claim.email) return;
    throw new EmployeeManagementError(created.error.code === "email_exists" ? "EMAIL_CONFLICT" : "PROVISIONING_FAILED");
  }
  if (created.data.user.id !== claim.auth_user_id || created.data.user.email?.toLowerCase() !== claim.email) throw new EmployeeManagementError("EMAIL_CONFLICT");
}
