import assert from "node:assert/strict";
import test from "node:test";

import { parseStockMovementFilters, stockMovementQuery } from "./stock-movement-filters";

test("valid movement and WIB calendar date filters are retained", () => {
  assert.deepEqual(parseStockMovementFilters({ movementType: "manual_receiving", startDate: "2026-11-01", endDate: "2026-11-07" }), {
    movementType: "manual_receiving", startDate: "2026-11-01", endDate: "2026-11-07",
  });
});

test("unknown, impossible, and reversed filter values are not sent to the database", () => {
  assert.deepEqual(parseStockMovementFilters({ movementType: "unknown", startDate: "2026-02-30", endDate: "bad" }), {});
  assert.deepEqual(parseStockMovementFilters({ movementType: "sale", startDate: "2026-11-08", endDate: "2026-11-07" }), { movementType: "sale" });
});

test("pagination URL preserves filters while a new form submission starts without a page", () => {
  const filters = { movementType: "stock_opname" as const, startDate: "2026-11-01", endDate: "2026-11-07" };
  assert.equal(stockMovementQuery(filters), "movementType=stock_opname&startDate=2026-11-01&endDate=2026-11-07");
  assert.equal(stockMovementQuery(filters, 3), "movementType=stock_opname&startDate=2026-11-01&endDate=2026-11-07&movementPage=3");
});
