import type { EmployeeRole } from "./types";
import { isPermission, type Permission, type PermissionOverride } from "./permissions";

export type AccountStatus = "active" | "disabled" | "not_invited" | "invited" | "retryable" | "failed";
export type EmployeeRow = { id: string; full_name: string; email: string | null; phone: string | null;
  position: EmployeeRole; join_date: string; is_active: boolean; account_status: AccountStatus; retryable: boolean | null };
export type PermissionCatalog = { definitions: Permission[]; presets: Record<EmployeeRole, Permission[]> };
export type EmployeeAccess = { role: EmployeeRole; is_active: boolean; account_enabled: boolean;
  definitions: Permission[]; preset: Permission[]; effective: Permission[]; overrides: PermissionOverride[] };
export const ROLE_LABELS: Record<EmployeeRole, string> = { owner_admin: "Pemilik (Admin)", kasir: "Kasir", staf: "Staf" };
export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Aktif", disabled: "Tidak Aktif", not_invited: "Belum Diundang", invited: "Menunggu Aktivasi",
  retryable: "Undangan Belum Selesai", failed: "Undangan Gagal",
};
export function filterEmployees(rows: EmployeeRow[], search: string, role: string, status: string) {
  const query = search.trim().toLocaleLowerCase("id-ID");
  return rows.filter(row => `${row.full_name} ${row.email ?? ""}`.toLocaleLowerCase("id-ID").includes(query) &&
    (!role || row.position === role) && (!status || row.account_status === status || status === "inactive" && !row.is_active));
}
export function lastUsableOwner(rows: EmployeeRow[], row: EmployeeRow) {
  return row.position === "owner_admin" && row.is_active && row.account_status === "active" &&
    rows.filter(item => item.position === "owner_admin" && item.is_active && item.account_status === "active").length === 1;
}
export function canInvite(row: EmployeeRow) {
  return row.is_active && ["not_invited", "invited", "retryable"].includes(row.account_status) &&
    (row.account_status !== "retryable" || row.retryable === true);
}
export function protectedPermission(code: string) {
  return code.startsWith("employees.") || ["permissions.manage", "audit.view", "products.activate", "products.create"].includes(code) ||
    code.startsWith("submissions.") && !["submissions.view_own", "submissions.create", "submissions.edit_own", "submissions.submit"].includes(code);
}
export function parseEmployees(value: unknown): EmployeeRow[] {
  if (!Array.isArray(value)) throw new Error("invalid response");
  return value.map(row => {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || typeof row.full_name !== "string" ||
        !Object.hasOwn(ROLE_LABELS, row.position) || !Object.hasOwn(STATUS_LABELS, row.account_status) ||
        typeof row.is_active !== "boolean" || typeof row.join_date !== "string" ||
        row.email !== null && typeof row.email !== "string" || row.phone !== null && typeof row.phone !== "string") throw new Error("invalid response");
    return { id: row.id, full_name: row.full_name, position: row.position, account_status: row.account_status,
      email: row.email, phone: row.phone, join_date: row.join_date, is_active: row.is_active, retryable: row.retryable === true };
  });
}
export function knownPermissions(value: unknown): Permission[] {
  return Array.isArray(value) ? value.filter((item): item is Permission => typeof item === "string" && isPermission(item)) : [];
}
export function parseEmployeeAccess(value: unknown): EmployeeAccess {
  if (!value || typeof value !== "object") throw new Error("invalid response");
  const row = value as Record<string, unknown>;
  if (typeof row.role !== "string" || !Object.hasOwn(ROLE_LABELS, row.role) || typeof row.is_active !== "boolean" || !Array.isArray(row.overrides)) throw new Error("invalid response");
  return { role: row.role as EmployeeRole, is_active: row.is_active, account_enabled: row.account_enabled === true,
    definitions: knownPermissions(row.definitions), preset: knownPermissions(row.preset), effective: knownPermissions(row.effective),
    overrides: row.overrides.flatMap(item => item && typeof item === "object" && typeof item.permission === "string" && isPermission(item.permission) &&
      (item.effect === "allow" || item.effect === "deny") ? [{ permission: item.permission, effect: item.effect }] : []) };
}
