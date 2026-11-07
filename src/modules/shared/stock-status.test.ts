import assert from "node:assert/strict";
import test from "node:test";

import { stockStatus } from "./stock-status";

test("stock status follows one inclusive minimum boundary", () => {
  assert.equal(stockStatus(0, 5), "out");
  assert.equal(stockStatus(4, 5), "low");
  assert.equal(stockStatus(5, 5), "low");
  assert.equal(stockStatus(6, 5), "normal");
  assert.equal(stockStatus(1, 0), "normal");
  assert.equal(stockStatus(0, 0), "out");
});
