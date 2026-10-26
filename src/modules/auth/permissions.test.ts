import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PERMISSIONS } from "./permissions";
import { hasPermission, requireAllPermissionsWith, type PermissionData, type PermissionDependencies } from "./application/permission-policy";
import { requireRoleWith } from "./application/auth-policy";
import { AuthApplicationError } from "./errors";

const data: PermissionData = { definitions: PERMISSIONS, preset: ["products.view"], overrides: [] };
const deps: PermissionDependencies = {
  getUser: async () => ({ id: "auth" }),
  findEmployee: async () => ({ employeeId: "employee", name: "Kasir", role: "kasir", isActive: true }),
  signOut: async () => {}, loadPermissions: async () => data,
};
const denied = (code: string) => (error: unknown) => error instanceof AuthApplicationError && error.code === code;

test("preset permissions are granted without granting missing capabilities", () => {
  assert.equal(hasPermission("kasir", "products.view", data), true);
  assert.equal(hasPermission("kasir", "pricing.cost.view", data), false);
  assert.equal(hasPermission("staf", "products.view", { ...data, preset: [] }), false);
});
test("individual allow and deny override role presets", () => {
  assert.equal(hasPermission("kasir", "products.view", { ...data, overrides: [{ permission: "products.view", effect: "deny" }] }), false);
  assert.equal(hasPermission("staf", "pricing.cost.view", { ...data, overrides: [{ permission: "pricing.cost.view", effect: "allow" }] }), true);
});
test("unknown and absent definitions are denied even for owners", () => {
  for (const role of ["owner_admin", "kasir", "staf"] as const) {
    assert.equal(hasPermission(role, "invented.permission", { ...data, preset: ["invented.permission"] }), false);
    assert.equal(hasPermission(role, "products.view", { ...data, definitions: [] }), false);
  }
});
test("owner has all known permissions and overrides cannot reduce control", () => {
  for (const permission of PERMISSIONS) assert.equal(hasPermission("owner_admin", permission, { ...data, preset: [], overrides: [{ permission, effect: "deny" }] }), true);
});
test("guard returns existing employee identity and requires every capability", async () => {
  assert.equal((await requireAllPermissionsWith(["products.view"], deps)).employeeId, "employee");
  await assert.rejects(() => requireAllPermissionsWith(["products.view", "products.edit"], deps), denied("FORBIDDEN"));
  await assert.rejects(() => requireAllPermissionsWith([], deps), denied("FORBIDDEN"));
});
test("inactive employees are rejected before permission loading", async () => {
  await assert.rejects(() => requireAllPermissionsWith(["products.view"], {
    ...deps, findEmployee: async () => ({ employeeId: "employee", name: "Owner", role: "owner_admin", isActive: false }),
    loadPermissions: async () => { throw new Error("must not load"); },
  }), denied("EMPLOYEE_INACTIVE"));
});
test("unauthenticated and unmapped identities cannot use permission guards", async () => {
  await assert.rejects(() => requireAllPermissionsWith(["products.view"], { ...deps, getUser: async () => null }), denied("UNAUTHENTICATED"));
  await assert.rejects(() => requireAllPermissionsWith(["products.view"], { ...deps, findEmployee: async () => null }), denied("EMPLOYEE_NOT_FOUND"));
});
test("permission store failure fails closed", async () => {
  await assert.rejects(() => requireAllPermissionsWith(["products.view"], { ...deps, loadPermissions: async () => { throw new Error("unavailable"); } }), /unavailable/);
});
test("legacy role guards do not consult or accept new overrides", async () => {
  assert.equal((await requireRoleWith(["owner_admin", "kasir"], deps)).role, "kasir");
  await assert.rejects(() => requireRoleWith(["owner_admin"], deps), denied("FORBIDDEN"));
});

test("migration definitions exactly match the application catalog", () => {
  const sql = readFileSync("supabase/migrations/0020_permission_foundation.sql", "utf8");
  const insert = sql.split("INSERT INTO public.permission_definitions VALUES ")[1].split(";")[0];
  const definitions = [...insert.matchAll(/\('([^']+)'\)/g)].map(match => match[1]);
  assert.deepEqual(definitions.sort(), [...PERMISSIONS].sort());
});
