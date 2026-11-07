import assert from "node:assert/strict";
import test from "node:test";

import {
  INVENTORY_PAGE_SIZE,
  parseInventoryOverviewFilters,
} from "./inventory-overview-filters";

test("inventory overview filters parse search, status, and page with a 10-row page size", () => {
  assert.deepEqual(parseInventoryOverviewFilters({ q: "  paracetamol ", status: "low", page: "3" }), {
    q: "paracetamol",
    status: "low",
    page: 3,
    limit: 10,
  });
  assert.deepEqual(parseInventoryOverviewFilters({ q: "", status: "all" }), {
    q: "",
    status: "all",
    page: 1,
    limit: INVENTORY_PAGE_SIZE,
  });
  assert.equal(parseInventoryOverviewFilters({ status: "normal" }).status, "normal");
  assert.equal(parseInventoryOverviewFilters({ status: "safe" }).status, "normal");
  assert.deepEqual(parseInventoryOverviewFilters({ status: "unknown", page: "-2" }), {
    q: "",
    status: "all",
    page: 1,
    limit: 10,
  });
  assert.equal(parseInventoryOverviewFilters({ page: "0" }).page, 1);
  assert.equal(parseInventoryOverviewFilters({ page: "99999" }).page, 10000);
  assert.equal(parseInventoryOverviewFilters({ q: "a%b" }).q, "");
});
