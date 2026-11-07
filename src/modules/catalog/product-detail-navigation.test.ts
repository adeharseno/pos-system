import assert from "node:assert/strict";
import test from "node:test";

import { isSafeProductReturnReferrer } from "./product-detail-navigation";

test("product detail return navigation accepts only same-origin product or inventory lists", () => {
  const origin = "https://pos.example.test";
  assert.equal(isSafeProductReturnReferrer(`${origin}/products?q=obat`, origin), true);
  assert.equal(isSafeProductReturnReferrer(`${origin}/inventory?page=2`, origin), true);
  assert.equal(isSafeProductReturnReferrer(`${origin}/products/id/edit`, origin), false);
  assert.equal(isSafeProductReturnReferrer("https://evil.example/inventory", origin), false);
  assert.equal(isSafeProductReturnReferrer("not-a-url", origin), false);
});
