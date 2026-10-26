import "server-only";
import { requirePermission } from "./auth-service";
import { AuthApplicationError } from "../errors";
import { EmployeeManagementError } from "../employee-errors";
import { allowedKeys, employeeRole, employeeValues, employeeOriginAllowed, invitationRedirect, normalizeEmail, permissionChange, requiredText } from "../employee-validation";
import { employeeRpc, ensureInvitationUser, invitationClaim } from "../data/employee-repository";
import { inviteEmployeeWith } from "./invitation-workflow";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { hasPermission } from "./permission-policy";
import { PERMISSIONS } from "../permissions";
import type { EmployeeRole, EmployeeSession } from "../types";
import type { PermissionOverride } from "../permissions";
import { headers } from "next/headers";
import { knownPermissions, type PermissionCatalog } from "../employee-ui-model";

async function checkRequestOrigin() {
  const origin = (await headers()).get("origin");
  if (origin && !employeeOriginAllowed(origin, process.env.APP_SITE_URL, process.env.APP_ADDITIONAL_ORIGINS)) throw new AuthApplicationError("FORBIDDEN");
}

export async function requireEmployeeManager(permission: string): Promise<EmployeeSession> {
  await checkRequestOrigin();
  const employee = await requirePermission(permission);
  // Administrative capabilities cannot be delegated through an override.
  if (employee.role !== "owner_admin") throw new AuthApplicationError("FORBIDDEN");
  return employee;
}

export async function listEmployees(params: URLSearchParams) {
  const actor = await requireEmployeeManager("employees.view");
  const limit = Number(params.get("limit") ?? 50), offset = Number(params.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new PosInputError("invalid pagination");
  return employeeRpc("employee_admin_read", { p_actor: actor.authUserId, p_limit: limit, p_offset: offset });
}
export async function getEmployee(id: string) {
  const actor = await requireEmployeeManager("employees.view");
  const rows = await employeeRpc("employee_admin_read", { p_actor: actor.authUserId, p_employee: requireUuid(id, "employee_id") });
  if (!Array.isArray(rows) || !rows[0]) throw new EmployeeManagementError("EMPLOYEE_NOT_FOUND");
  return rows[0];
}
export async function writeEmployee(operation: "create" | "edit" | "access" | "role", id: string | null, body: Record<string, unknown>) {
  const actor = await requireEmployeeManager(operation === "create" ? "employees.create" : operation === "access" ? "employees.deactivate" : "employees.edit");
  const reason = requiredText(body.reason);
  let values;
  if (operation === "create" || operation === "edit") values = employeeValues(body, operation === "create");
  else if (operation === "access") {
    allowedKeys(body, ["is_active", "reason"]);
    if (typeof body.is_active !== "boolean") throw new PosInputError("invalid active state");
    values = { is_active: body.is_active };
  } else {
    allowedKeys(body, ["position", "reason"]);
    values = { position: employeeRole(body.position) };
  }
  const employeeId = await employeeRpc("employee_admin_write", { p_actor: actor.authUserId, p_operation: operation,
    p_employee: id ? requireUuid(id, "employee_id") : null, p_values: values, p_reason: reason });
  return { employee_id: employeeId, message: operation === "create" ? "Pegawai berhasil ditambahkan." : "Data pegawai berhasil diperbarui." };
}
export async function getEmployeePermissions(id: string) {
  const actor = await requireEmployeeManager("permissions.manage");
  const result = await employeeRpc("employee_permission_read", { p_actor: actor.authUserId, p_employee: requireUuid(id, "employee_id") });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid permission result");
  // Database constraints define these values; whitelist the returned capability names too.
  const data = { definitions: Array.isArray(result.definitions) ? result.definitions.filter((v): v is string => typeof v === "string") : [], preset: Array.isArray(result.preset) ? result.preset.filter((v): v is string => typeof v === "string") : [],
    overrides: (Array.isArray(result.overrides) ? result.overrides : []).map(row => {
      if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.permission !== "string" || (row.effect !== "allow" && row.effect !== "deny")) throw new Error("Invalid permission result");
      return { permission: row.permission, effect: row.effect } as PermissionOverride;
    }) };
  return { role: result.role, is_active: result.is_active, account_enabled: result.account_enabled, definitions: knownPermissions(data.definitions), preset: data.preset, overrides: data.overrides,
    effective: result.is_active && result.account_enabled ? PERMISSIONS.filter(p => hasPermission(result.role as EmployeeRole, p, data)) : [] };
}
export async function getEmployeePermissionCatalog(): Promise<PermissionCatalog> {
  await requireEmployeeManager("permissions.manage");
  const admin = createAdminSupabaseClient();
  const [definitions, presets] = await Promise.all([
    admin.from("permission_definitions").select("code"), admin.from("role_permissions").select("role,permission_code"),
  ]);
  if (definitions.error || presets.error) throw new Error("Permission catalog unavailable");
  return { definitions: knownPermissions(definitions.data.map(row => row.code)), presets: {
    owner_admin: knownPermissions(presets.data.filter(row => row.role === "owner_admin").map(row => row.permission_code)),
    kasir: knownPermissions(presets.data.filter(row => row.role === "kasir").map(row => row.permission_code)),
    staf: knownPermissions(presets.data.filter(row => row.role === "staf").map(row => row.permission_code)),
  } };
}
export async function updateEmployeePermission(id: string, body: Record<string, unknown>) {
  const actor = await requireEmployeeManager("permissions.manage");
  const change = permissionChange(body);
  await employeeRpc("set_employee_permission_override", { p_actor_auth_user_id: actor.authUserId,
    p_employee_id: requireUuid(id, "employee_id"), p_permission_code: change.permission, p_effect: change.effect, p_reason: change.reason });
  return { message: "Izin pegawai berhasil diperbarui." };
}
export async function inviteEmployee(id: string, body: Record<string, unknown>) {
  const actor = await requireEmployeeManager("employees.invite");
  allowedKeys(body, ["email"]);
  const email = normalizeEmail(body.email), employeeId = requireUuid(id, "employee_id");
  const redirectTo = invitationRedirect(process.env.APP_SITE_URL);
  const command = (op: string, attempt?: string, failure?: string) => employeeRpc("employee_invitation_command", {
    p_actor: actor.authUserId, p_operation: op, p_employee: employeeId, p_email: email, p_attempt: attempt, p_failure: failure,
  });
  return inviteEmployeeWith({
    claim: async () => invitationClaim(await command("claim")),
    ensureUser: ensureInvitationUser,
    link: async claim => { await command("link", claim.attempt_id); },
    send: async claim => {
      // Revalidate both the current administrator and this attempt immediately before external delivery.
      await command("link", claim.attempt_id);
      const auth = createAdminSupabaseClient().auth;
      const current = await auth.admin.getUserById(claim.auth_user_id);
      if (current.error || current.data.user.email?.toLowerCase() !== claim.email) throw new EmployeeManagementError("PROVISIONING_FAILED");
      // A previously verified invitation can expire before password setup. Recovery
      // delivers a fresh setup token for this same reserved, already-linked account.
      if (current.data.user.email_confirmed_at) {
        const recovery = await auth.resetPasswordForEmail(claim.email, { redirectTo });
        if (recovery.error) throw new EmployeeManagementError("DELIVERY_FAILED");
        return;
      }
      const result = await auth.admin.inviteUserByEmail(claim.email, { redirectTo });
      if (result.error) throw new EmployeeManagementError("DELIVERY_FAILED");
      if (result.data.user.id !== claim.auth_user_id) throw new EmployeeManagementError("EMAIL_CONFLICT");
    },
    sent: async claim => { await command("sent", claim.attempt_id); },
    fail: async (claim, code) => { await command("fail", claim.attempt_id, code); },
  });
}

export async function acceptInvitationToken(tokenHash: unknown, tokenType: unknown = "invite") {
  await checkRequestOrigin();
  const token = requiredText(tokenHash, 2048);
  if (tokenType !== "invite" && tokenType !== "recovery") throw new PosInputError("invalid invitation type");
  const client = await createServerSupabaseClient();
  const result = await client.auth.verifyOtp({ token_hash: token, type: tokenType });
  if (result.error || !result.data.user) throw new EmployeeManagementError("INVITATION_STALE");
  try { await employeeRpc("employee_invitation_accept", { p_auth_user: result.data.user.id }); }
  catch (error) { await client.auth.signOut(); throw error; }
  return { message: "Undangan terverifikasi. Silakan atur kata sandi." };
}
export async function setInvitationPassword(body: Record<string, unknown>) {
  await checkRequestOrigin();
  allowedKeys(body, ["password"]);
  const password = body.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new PosInputError("invalid password");
  const client = await createServerSupabaseClient();
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) throw new AuthApplicationError("UNAUTHENTICATED");
  await employeeRpc("employee_invitation_accept", { p_auth_user: verified.data.user.id });
  const updated = await client.auth.updateUser({ password });
  if (updated.error) throw new PosInputError("password rejected");
  await employeeRpc("employee_invitation_accept", { p_auth_user: verified.data.user.id, p_complete: true });
  return { message: "Kata sandi berhasil disimpan. Akun siap digunakan." };
}
export async function invitationSetupAvailable(): Promise<boolean> {
  const client = await createServerSupabaseClient();
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) return false;
  try { await employeeRpc("employee_invitation_accept", { p_auth_user: verified.data.user.id }); return true; }
  catch { return false; }
}
