import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PosDataAccessError } from "@/modules/shared/errors/pos-domain-error";
import type { EmployeeRole } from "../types";
import type { PermissionData } from "../application/permission-policy";
import type { PermissionOverride } from "../permissions";

export async function loadPermissions(employeeId: string, role: EmployeeRole): Promise<PermissionData> {
  const client = createAdminSupabaseClient();
  const result = await client.rpc("get_employee_permissions", { p_employee_id: employeeId, p_role: role });
  if (result.error) throw new PosDataAccessError(result.error);
  const value = result.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid permission response");
  const { definitions, preset, overrides } = value;
  if (!Array.isArray(definitions) || !definitions.every(x => typeof x === "string") ||
      !Array.isArray(preset) || !preset.every(x => typeof x === "string") || !Array.isArray(overrides)) {
    throw new Error("Invalid permission response");
  }
  const rows = overrides.map((row): PermissionOverride => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.permission !== "string" ||
        (row.effect !== "allow" && row.effect !== "deny")) throw new Error("Invalid permission override");
    return { permission: row.permission, effect: row.effect };
  });
  return { definitions, preset, overrides: rows };
}
