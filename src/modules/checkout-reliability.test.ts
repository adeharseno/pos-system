import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireSubmissionLock,
  clearPersistedPendingCheckout,
  computeCartFingerprint,
  getPersistedPendingCheckout,
  persistPendingCheckout,
  reconcileCartWithAvailability,
  releaseSubmissionLock,
} from "./sales/checkout-reliability";

const line = {
  productId: "p1",
  productName: "TREMENZA TAB",
  productUnitId: "u1",
  unitLabel: "TAB",
  quantity: 20,
  conversionToBase: 1,
  displayedUnitPrice: 3500,
  requiresPrescription: true,
};

test("synchronous checkout lock rejects a rapid second submit", () => {
  const lock = { current: false };
  assert.equal(acquireSubmissionLock(lock), true);
  assert.equal(acquireSubmissionLock(lock), false);
  releaseSubmissionLock(lock);
  assert.equal(acquireSubmissionLock(lock), true);
});

test("insufficient stock clamps cart to authoritative availability", () => {
  const result = reconcileCartWithAvailability([line], [{ productId: "p1", availableStockBase: 18 }]);
  assert.equal(result.cart[0].quantity, 18);
  assert.match(result.message, /tersisa 18 TAB/);
});

test("out of stock removes the stale cart line", () => {
  const result = reconcileCartWithAvailability([line], [{ productId: "p1", availableStockBase: 0 }]);
  assert.deepEqual(result.cart, []);
  assert.match(result.message, /stok habis/);
});

test("computeCartFingerprint generates stable signature regardless of cart order", () => {
  const line2 = { ...line, productId: "p2", productUnitId: "u2" };
  const sig1 = computeCartFingerprint([line, line2]);
  const sig2 = computeCartFingerprint([line2, line]);
  assert.equal(sig1, sig2);
  assert.match(sig1, /p1:u1:20:3500/);
});

test("persisted pending checkout survives modal close and is recovered for retry", () => {
  const mockStorage = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, val: string) => mockStorage.set(key, val),
      removeItem: (key: string) => mockStorage.delete(key),
    },
  };

  const fingerprint = computeCartFingerprint([line]);
  const requestId = "11111111-2222-3333-4444-555555555555";

  // Simulate timeout persisting ambiguous checkout
  persistPendingCheckout(requestId, fingerprint, true);

  // Recovery (e.g. after modal reopen or page reload)
  const recovered = getPersistedPendingCheckout(fingerprint);
  assert.ok(recovered);
  assert.equal(recovered.requestId, requestId);
  assert.equal(recovered.uncertain, true);

  // Different cart should not recover this pending checkout
  const differentCart = computeCartFingerprint([{ ...line, quantity: 5 }]);
  assert.equal(getPersistedPendingCheckout(differentCart), null);

  // Successful checkout clears storage
  clearPersistedPendingCheckout();
  assert.equal(getPersistedPendingCheckout(fingerprint), null);

  delete (globalThis as unknown as { window?: unknown }).window;
});
