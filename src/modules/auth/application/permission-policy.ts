import { AuthApplicationError } from "../errors";
import { isPermission, type PermissionOverride } from "../permissions";
import type { EmployeeRole } from "../types";
import { requireEmployeeWith, type AuthDependencies } from "./auth-policy";

export interface PermissionData {
  definitions: readonly string[];
  preset: readonly string[];
  overrides: readonly PermissionOverride[];
}
export interface PermissionDependencies extends AuthDependencies {
  loadPermissions: (employeeId: string, role: EmployeeRole) => Promise<PermissionData>;
}

export function hasPermission(role: EmployeeRole, permission: string, data: PermissionData): boolean {
  if (!isPermission(permission) || !data.definitions.includes(permission)) return false;
  if (role === "owner_admin") return true;
  const overrides = data.overrides.filter(row => row.permission === permission);
  if (overrides.some(row => row.effect === "deny")) return false;
  return overrides.some(row => row.effect === "allow") || data.preset.includes(permission);
}

export async function requireAllPermissionsWith(permissions: readonly string[], dependencies: PermissionDependencies) {
  const employee = await requireEmployeeWith(dependencies);
  // Empty requirements must not accidentally authorize an operation.
  if (!permissions.length) throw new AuthApplicationError("FORBIDDEN");
  const data = await dependencies.loadPermissions(employee.employeeId, employee.role);
  if (!permissions.every(permission => hasPermission(employee.role, permission, data))) {
    throw new AuthApplicationError("FORBIDDEN");
  }
  return employee;
}
