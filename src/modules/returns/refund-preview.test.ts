import { strict as assert } from "node:assert";
import { test } from "node:test";
import { amountCents, formatRefundCents, refundPreviewCents } from "./refund-preview";

test("partial base-unit return follows separate subtotal and tax rounding", () => {
  assert.equal(refundPreviewCents({ purchasedBase: 20, returnedBase: 0, quantityBase: 5, subtotal: BigInt(1001), tax: BigInt(101), returnedSubtotal: BigInt(0), returnedTax: BigInt(0) }), BigInt(275));
});

test("last partial return refunds exact remainder after prior rounding", () => {
  assert.equal(refundPreviewCents({ purchasedBase: 20, returnedBase: 5, quantityBase: 15, subtotal: BigInt(1001), tax: BigInt(101), returnedSubtotal: BigInt(250), returnedTax: BigInt(25) }), BigInt(827));
});

test("zero and excessive returns are rejected", () => {
  const base = { purchasedBase: 20, returnedBase: 5, subtotal: BigInt(100), tax: BigInt(0), returnedSubtotal: BigInt(25), returnedTax: BigInt(0) };
  assert.throws(() => refundPreviewCents({ ...base, quantityBase: 0 }));
  assert.throws(() => refundPreviewCents({ ...base, quantityBase: 16 }));
});

test("refund formatting preserves cents", () => {
  assert.equal(amountCents(1234.05), BigInt(123405));
  assert.equal(formatRefundCents(BigInt(123405)), "Rp 1.234,05");
});
