import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { PermissionData } from "@/modules/auth/application/permission-policy";
import { authorizedDashboardRead, canReadDashboardFinancials, cents, dashboardActions, dashboardFilters, rupiah } from "./dashboard-model";

const permissions: PermissionData = { definitions: PERMISSIONS, preset: [...PERMISSIONS], overrides: [] };

test("dashboard periods match reports full week/month and use Jakarta rollover", () => {
  const now = new Date("2026-01-04T18:00:00Z");
  assert.deepEqual(dashboardFilters({}, now), { preset: "today", period: { from: "2026-01-05", to: "2026-01-05" }, year: 2026 });
  assert.deepEqual(dashboardFilters({ period: "week" }, now).period, { from: "2026-01-05", to: "2026-01-11" });
  assert.deepEqual(dashboardFilters({ period: "month" }, now).period, { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(dashboardFilters({ period: "custom", from: "2024-02-29", to: "2024-03-01", year: "2023" }, now), { preset: "custom", period: { from: "2024-02-29", to: "2024-03-01" }, year: 2023 });
});

test("invalid dates, oversized series, reversed ranges and invalid chart years fail", () => {
  for (const query of [
    { period: "custom", from: "2026-02-30", to: "2026-03-01" },
    { period: "custom", from: "2026-03-02", to: "2026-03-01" },
    { period: "custom", from: "2025-01-01", to: "2026-12-31" },
    { year: "NaN" }, { year: "2026.5" }, { year: "0" }, { year: "10000" },
  ]) assert.throws(() => dashboardFilters(query));
  assert.doesNotThrow(() => dashboardFilters({ period: "custom", from: "2024-01-01", to: "2024-12-31" }));
});

test("cashier/staff never read financial data, including with all explicit grants", async () => {
  for (const role of ["kasir", "staf"] as const) {
    let reads = 0;
    const grants: PermissionData = { ...permissions, overrides: PERMISSIONS.map(permission => ({ permission, effect: "allow" })) };
    assert.equal(canReadDashboardFinancials(role, grants), false);
    await assert.rejects(authorizedDashboardRead(role, grants, async () => { reads++; return { cogs: "sensitive" }; }), /FORBIDDEN/);
    assert.equal(reads, 0);
  }
  assert.equal(await authorizedDashboardRead("owner_admin", permissions, async () => "authorized"), "authorized");
  await assert.rejects(authorizedDashboardRead("owner_admin", { ...permissions, definitions: [] }, async () => "unexpected"), /FORBIDDEN/);
});

test("quick actions intersect permissions with unchanged legacy page role guards", () => {
  const cashier = dashboardActions("kasir", permissions).map(action => action.href);
  assert.ok(cashier.includes("/cashier"));
  assert.ok(cashier.includes("/cash-drawer"));
  assert.ok(!cashier.includes("/products/new"));
  assert.ok(!cashier.includes("/inventory/receive"));
  const staff = dashboardActions("staf", permissions).map(action => action.href);
  assert.deepEqual(staff, []);
  const denied: PermissionData = { ...permissions, overrides: [{ permission: "cashier.view", effect: "deny" }] };
  assert.ok(!dashboardActions("kasir", denied).some(action => action.href === "/cashier"));
  assert.deepEqual(dashboardActions("staf", { ...permissions, preset: [] }), []);
});

test("financial presentation retains exact cents, negatives and large amounts", () => {
  assert.equal(rupiah(cents("10.01") - cents("10.11")), "-Rp 0,10");
  assert.equal(rupiah(cents("99999999999999.99")), "Rp 99.999.999.999.999,99");
  assert.equal(rupiah(cents("0.00")), "Rp 0");
  assert.throws(() => cents("1e4"));
});
