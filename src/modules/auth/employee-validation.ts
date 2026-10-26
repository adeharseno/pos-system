import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { isPermission } from "./permissions";
import { EmployeeManagementError } from "./employee-errors";

export function allowedKeys(body: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(body).some(key => !keys.includes(key))) throw new PosInputError("unknown field");
}
export function requiredText(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PosInputError("invalid text");
  return value.trim();
}
export function employeeRole(value: unknown) {
  if (value !== "owner_admin" && value !== "kasir" && value !== "staf") throw new PosInputError("invalid role");
  return value;
}
export function normalizeEmail(value: unknown) {
  const email = requiredText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PosInputError("invalid email");
  return email;
}
function date(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new PosInputError("invalid date");
  return value;
}
export function employeeValues(body: Record<string, unknown>, create: boolean) {
  allowedKeys(body, create ? ["request_id", "full_name", "position", "phone", "join_date", "reason"] : ["full_name", "phone", "join_date", "reason"]);
  const values: Record<string, string | null> = {};
  if (create || "full_name" in body) values.full_name = requiredText(body.full_name, 150);
  if (create) {
    values.request_id = requireUuid(requiredText(body.request_id), "request_id");
    values.position = employeeRole(body.position ?? "staf");
  }
  if ("phone" in body) values.phone = body.phone === null || body.phone === "" ? null : requiredText(body.phone, 40);
  if ("join_date" in body) values.join_date = date(body.join_date);
  if (!create && Object.keys(values).length === 0) throw new PosInputError("empty edit");
  return values;
}
export function permissionChange(body: Record<string, unknown>) {
  allowedKeys(body, ["permission", "effect", "reason"]);
  const permission = requiredText(body.permission);
  if (!isPermission(permission)) throw new EmployeeManagementError("UNKNOWN_PERMISSION");
  if (permission.startsWith("employees.") || ["permissions.manage", "audit.view", "products.activate", "products.create"].includes(permission) ||
      permission.startsWith("submissions.") && !["submissions.view_own", "submissions.create", "submissions.edit_own", "submissions.submit"].includes(permission)) {
    throw new EmployeeManagementError("PROTECTED_PERMISSION");
  }
  const effect = body.effect;
  if (effect !== null && effect !== "allow" && effect !== "deny") throw new PosInputError("invalid effect");
  return { permission, effect, reason: requiredText(body.reason) };
}

/** No request-supplied URL, Host header, or open redirect is used. */
export function invitationRedirect(siteUrl: string | undefined) {
  try {
    const url = new URL(siteUrl ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) throw new Error();
    return new URL("/auth/invite", url).toString();
  } catch { throw new EmployeeManagementError("INVITATION_CONFIG"); }
}

export function employeeOriginAllowed(origin: string, siteUrl: string | undefined, additionalOrigins = "") {
  const trusted = [siteUrl, ...additionalOrigins.split(",").map(value => value.trim()).filter(Boolean)];
  return trusted.some(value => {
    try { return origin === new URL(invitationRedirect(value)).origin; }
    catch { return false; }
  });
}
