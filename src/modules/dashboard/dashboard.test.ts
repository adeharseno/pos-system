import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS } from "@/modules/auth/permissions";
import type { PermissionData } from "@/modules/auth/application/permission-policy";
import { authorizedDashboardRead, canReadDashboardFinancials, canReadDashboardStock, cents, dashboardActions, dashboardFilters, dashboardLowStockRows, rupiah } from "./dashboard-model";
import { productStockStatus } from "@/modules/catalog/product-stock-status";

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
  assert.ok(!cashier.includes("/transactions"));
  assert.ok(!cashier.includes("/products/new"));
  assert.ok(!cashier.includes("/inventory/receive"));
  const staff = dashboardActions("staf", permissions).map(action => action.href);
  assert.deepEqual(staff, []);
  const owner = dashboardActions("owner_admin", permissions).map(action => action.href);
  assert.ok(owner.includes("/transactions"));
  const denied: PermissionData = { ...permissions, overrides: [{ permission: "cashier.view", effect: "deny" }] };
  assert.ok(!dashboardActions("kasir", denied).some(action => action.href === "/cashier"));
  assert.deepEqual(dashboardActions("staf", { ...permissions, preset: [] }), []);
});

test("low stock keeps only the five most depleted items, then follows product-list thresholds and inventory permission", () => {
  assert.equal(productStockStatus(0, 0), "out");
  assert.equal(productStockStatus(1, 0), "normal");
  assert.equal(productStockStatus(4, 5), "low");
  assert.equal(productStockStatus(5, 5), "normal");
  const input = [
    { id: "low-4c", name: "Menipis 4 C", baseUnit: "Tablet", availableStock: "4", minimumStock: 5, status: "low" },
    { id: "low-2", name: "Menipis 2", baseUnit: "Tablet", availableStock: "2", minimumStock: 5, status: "low" },
    { id: "out", name: "Habis", baseUnit: "Botol", availableStock: "0", minimumStock: 0, status: "out" },
    { id: "low-4a", name: "Menipis 4 A", baseUnit: "Tablet", availableStock: "4", minimumStock: 5, status: "low" },
    { id: "low-1", name: "Menipis 1", baseUnit: "Tablet", availableStock: "1", minimumStock: 5, status: "low" },
    { id: "low-4b", name: "Menipis 4 B", baseUnit: "Tablet", availableStock: "4", minimumStock: 5, status: "low" },
    { id: "low-3", name: "Menipis 3", baseUnit: "Tablet", availableStock: "3", minimumStock: 5, status: "low" },
  ];
  const rows = dashboardLowStockRows(input);
  assert.deepEqual(rows.map(row => row.id), ["out", "low-1", "low-2", "low-3", "low-4a"]);
  assert.deepEqual(dashboardLowStockRows(input, 2).map(row => row.id), ["out", "low-1"]);
  assert.throws(() => dashboardLowStockRows([{ id: "normal", name: "Normal", baseUnit: "Tablet", availableStock: "5", minimumStock: 5, status: "low" }]));
  assert.equal(canReadDashboardStock("owner_admin", permissions), true);
  assert.equal(canReadDashboardStock("kasir", { ...permissions, preset: ["inventory.view"] }), true);
  assert.equal(canReadDashboardStock("kasir", { ...permissions, preset: ["inventory.view"], overrides: [{ permission: "inventory.view", effect: "deny" }] }), false);
  assert.equal(canReadDashboardStock("staf", { ...permissions, preset: [] }), false);
});

test("financial presentation retains exact cents, negatives and large amounts", () => {
  assert.equal(rupiah(cents("10.01") - cents("10.11")), "-Rp 0,10");
  assert.equal(rupiah(cents("99999999999999.99")), "Rp 99.999.999.999.999,99");
  assert.equal(rupiah(cents("0.00")), "Rp 0");
  assert.throws(() => cents("1e4"));
});
