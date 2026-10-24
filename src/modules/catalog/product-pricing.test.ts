import assert from "node:assert/strict";
import test from "node:test";
import { formatMarginPercent, marginFromSellingPrice, sellingPriceFromCost } from "./product-pricing";

test("cost, margin, and tax calculate whole-Rupiah selling price", () => {
  assert.equal(sellingPriceFromCost(1000, 11, 20), 1332);
});

test("manual selling price calculates margin without a pricing loop", () => {
  const margin = marginFromSellingPrice(1000, 11, 1500);
  assert.equal(formatMarginPercent(margin ?? Number.NaN), "35.14");
});

test("tax changes recalculate selling price", () => {
  assert.equal(sellingPriceFromCost(1000, 0, 20), 1200);
  assert.equal(sellingPriceFromCost(1000, 15, 20), 1380);
});
