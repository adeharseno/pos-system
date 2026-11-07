import assert from "node:assert/strict";
import test from "node:test";
import { transactionActionVisibility } from "./transaction-detail-ui";

test("pending QRIS offers confirmation and void; paid QRIS never offers void", () => {
  assert.deepEqual(transactionActionVisibility("pending_payment", "qris", false), { confirm: true, void: true });
  assert.deepEqual(transactionActionVisibility("completed", "qris", false), { confirm: false, void: false });
});

test("cash void is hidden after any return; no action is shown on a voided transaction", () => {
  assert.deepEqual(transactionActionVisibility("completed", "cash", false), { confirm: false, void: true });
  assert.deepEqual(transactionActionVisibility("completed", "cash", true), { confirm: false, void: false });
  for (const method of ["cash", "qris", "bank_transfer", "bpjs"]) {
    assert.deepEqual(transactionActionVisibility("voided", method, false), { confirm: false, void: false });
  }
});

test("bank transfer reuses manual confirmation and paid transfers cannot be voided", () => {
  assert.deepEqual(transactionActionVisibility("pending_payment", "bank_transfer", false), { confirm: true, void: true });
  assert.deepEqual(transactionActionVisibility("completed", "bank_transfer", false), { confirm: false, void: false });
});
