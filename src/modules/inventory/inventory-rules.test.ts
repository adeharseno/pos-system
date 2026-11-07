import assert from "node:assert/strict";
import test from "node:test";
import { inventoryExpiryStatus, summarizeInventoryBatches } from "./inventory-rules";

const businessDate = "2026-10-25";

test("inventory summary handles no, expired, zero, and mixed batches consistently", () => {
  assert.deepEqual(summarizeInventoryBatches([], 5, businessDate), { availableStock: 0, nearestExpiry: null, stockStatus: "out" });
  assert.deepEqual(summarizeInventoryBatches([{ quantity: 10, expiredDate: "2026-10-24" }], 5, businessDate), { availableStock: 0, nearestExpiry: null, stockStatus: "out" });
  assert.deepEqual(summarizeInventoryBatches([{ quantity: 0, expiredDate: "2026-12-01" }], 5, businessDate), { availableStock: 0, nearestExpiry: null, stockStatus: "out" });
  assert.deepEqual(summarizeInventoryBatches([{ quantity: 4, expiredDate: "2026-10-24" }, { quantity: 2, expiredDate: "2026-12-15" }, { quantity: 3, expiredDate: "2026-11-01" }], 5, businessDate), { availableStock: 5, nearestExpiry: "2026-11-01", stockStatus: "low" });
});

test("unknown expiry remains available but does not become nearest expiry", () => {
  assert.deepEqual(summarizeInventoryBatches([{ quantity: 4, expiredDate: null }, { quantity: 3, expiredDate: "2027-01-01" }], 5, businessDate), { availableStock: 7, nearestExpiry: "2027-01-01", stockStatus: "normal" });
  assert.deepEqual(summarizeInventoryBatches([{ quantity: 4, expiredDate: null }], 5, businessDate), { availableStock: 4, nearestExpiry: null, stockStatus: "low" });
});

test("inventory status uses the shared minimum-stock boundary", () => {
  assert.equal(summarizeInventoryBatches([{ quantity: 5, expiredDate: "2026-12-01" }], 5, businessDate).stockStatus, "low");
  assert.equal(summarizeInventoryBatches([{ quantity: 6, expiredDate: "2026-12-01" }], 5, businessDate).stockStatus, "normal");
  assert.equal(summarizeInventoryBatches([{ quantity: 1, expiredDate: "2026-12-01" }], 0, businessDate).stockStatus, "normal");
});

test("expiry statuses use the centralized 90-day threshold", () => {
  assert.equal(inventoryExpiryStatus(null, businessDate), "unknown");
  assert.equal(inventoryExpiryStatus("2026-10-24", businessDate), "expired");
  assert.equal(inventoryExpiryStatus("2027-01-23", businessDate), "expiring_soon");
  assert.equal(inventoryExpiryStatus("2027-01-24", businessDate), "safe");
});
