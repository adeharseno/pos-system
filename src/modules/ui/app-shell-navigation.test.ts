import assert from "node:assert/strict";
import test from "node:test";

import { navigationGroups, navigationGroupsForRole } from "./app-navigation";

test("master barang and manajemen stok are separate navigation destinations", () => {
  const inventory = navigationGroups.find(group => group.label === "Persediaan");
  assert.ok(inventory);
  assert.deepEqual(inventory.items.map(item => [item.label, item.href]), [
    ["Master Barang", "/products"],
    ["Manajemen Stok", "/inventory"],
  ]);
  assert.ok(!inventory.items.some(item => item.label.includes("&")));
});

test("cashier sidebar contains only checkout and read-only transaction history", () => {
  const hrefs = navigationGroupsForRole("kasir").flatMap(group => group.items.map(item => item.href));
  assert.deepEqual(hrefs, ["/cashier", "/transactions"]);
  assert.ok(navigationGroupsForRole("owner_admin").flatMap(group => group.items).some(item => item.href === "/products"));
});

test("master settings remain owner-only children and inventory has no duplicated settings", () => {
  const inventory = navigationGroups.find(group => group.label === "Persediaan")!;
  const master = inventory.items.find(item => item.href === "/products")!;
  const stock = inventory.items.find(item => item.href === "/inventory")!;
  assert.deepEqual(master.children?.map(child => child.href), [
    "/products/categories", "/products/subcategories", "/products/taxes", "/products/suppliers",
  ]);
  assert.ok(master.children?.every(child => child.admin));
  assert.equal(stock.children, undefined);
});
