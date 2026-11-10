import assert from "node:assert/strict";
import test from "node:test";
import {
  validateApproveReturn,
  validateCustomerReturnRequest,
  validateRejectReturn,
} from "./schemas";
import { canStartReturn, detailReturnState } from "./return-detail-state";
import { returnQuantity } from "./return-quantity";

test("1. validateCustomerReturnRequest validates required fields", () => {
  const valid = {
    employeeId: "11111111-1111-4111-8111-111111111111",
    transactionId: "22222222-2222-4222-8222-222222222222",
    refundMethod: "cash" as const,
    reason: "Kemasan rusak",
    items: [
      {
        transactionItemId: "33333333-3333-4333-8333-333333333333",
        quantityInBase: 2,
      },
    ],
  };

  const result = validateCustomerReturnRequest(valid);
  assert.equal(result.reason, "Kemasan rusak");
  assert.equal(result.items.length, 1);

  // Rejects empty items
  assert.throws(
    () => validateCustomerReturnRequest({ ...valid, items: [] }),
    /items must not be empty/
  );

  // Rejects blank reason
  assert.throws(
    () => validateCustomerReturnRequest({ ...valid, reason: "   " }),
    /reason/
  );

  // Rejects invalid transactionId
  assert.throws(
    () => validateCustomerReturnRequest({ ...valid, transactionId: "not-uuid" }),
    /transactionId/
  );
});

test("2. validateApproveReturn validates required fields and sets default notes", () => {
  const valid = {
    employeeId: "11111111-1111-4111-8111-111111111111",
    returnId: "22222222-2222-4222-8222-222222222222",
    adminNotes: "Disetujui setelah fisik barang diverifikasi",
  };

  const result = validateApproveReturn(valid);
  assert.equal(result.adminNotes, "Disetujui setelah fisik barang diverifikasi");

  // Defaults blank notes to 'Disetujui'
  const blank = validateApproveReturn({ ...valid, adminNotes: "  " });
  assert.equal(blank.adminNotes, "Disetujui");
});

test("3. validateRejectReturn requires mandatory admin notes", () => {
  const valid = {
    employeeId: "11111111-1111-4111-8111-111111111111",
    returnId: "22222222-2222-4222-8222-222222222222",
    adminNotes: "Kemasan sudah terbuka dan rusak oleh pembeli",
  };

  const result = validateRejectReturn(valid);
  assert.equal(result.adminNotes, "Kemasan sudah terbuka dan rusak oleh pembeli");

  assert.throws(
    () => validateRejectReturn({ ...valid, adminNotes: "   " }),
    /adminNotes/
  );
});

test("4. detailReturnState differentiates none, partial, and full returns", () => {
  // None returned
  assert.equal(
    detailReturnState([
      { purchasedBase: 10, returnedBase: 0, conversionToBase: 1, remainingBase: 10 },
    ]),
    "none"
  );

  // Partial returned
  assert.equal(
    detailReturnState([
      { purchasedBase: 10, returnedBase: 4, conversionToBase: 1, remainingBase: 6 },
    ]),
    "partial"
  );

  // Full returned
  assert.equal(
    detailReturnState([
      { purchasedBase: 10, returnedBase: 10, conversionToBase: 1, remainingBase: 0 },
    ]),
    "full"
  );

  // canStartReturn allowed only if status is completed and state !== full
  assert.equal(canStartReturn("completed", "none"), true);
  assert.equal(canStartReturn("completed", "partial"), true);
  assert.equal(canStartReturn("completed", "full"), false);
  assert.equal(canStartReturn("pending_payment", "none"), false);
  assert.equal(canStartReturn("voided", "none"), false);
});
