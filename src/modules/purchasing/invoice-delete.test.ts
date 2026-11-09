import assert from "node:assert/strict";
import test from "node:test";
import { checkInvoiceDeleteEligibility } from "./invoice-input";
import { invoiceDatabaseError, PurchaseInvoiceError } from "./invoice-errors";

test("1. Draft invoice without payments is eligible for deletion", () => {
  const result = checkInvoiceDeleteEligibility({
    status: "draft",
    paymentsCount: 0,
    totalPaid: 0,
  });

  assert.equal(result.canDelete, true);
  assert.equal(result.reason, undefined);
});

test("2. Invoice with payments is rejected with payment reason", () => {
  const result = checkInvoiceDeleteEligibility({
    status: "draft",
    paymentsCount: 1,
    totalPaid: 50000,
  });

  assert.equal(result.canDelete, false);
  assert.match(result.reason ?? "", /histori pembayaran/i);
});

test("3. Completed invoice (received stock) is rejected with stock/inventory reason", () => {
  const result = checkInvoiceDeleteEligibility({
    status: "completed",
    paymentsCount: 0,
    totalPaid: 0,
  });

  assert.equal(result.canDelete, false);
  assert.match(result.reason ?? "", /barang sudah diterima|stok/i);
});

test("4. Completed invoice with payments is rejected", () => {
  const result = checkInvoiceDeleteEligibility({
    status: "completed",
    paymentsCount: 2,
    totalPaid: 150000,
  });

  assert.equal(result.canDelete, false);
  assert.ok(result.reason && result.reason.length > 0);
});

test("5. Database delete error mapping translates error codes to user-friendly 409 messages", () => {
  assert.throws(
    () => invoiceDatabaseError({ message: "INVOICE_HAS_PAYMENTS" }),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseInvoiceError);
      assert.equal(err.status, 409);
      assert.match(err.message, /pembayaran/i);
      return true;
    }
  );

  assert.throws(
    () => invoiceDatabaseError({ message: "INVOICE_ALREADY_RECEIVED" }),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseInvoiceError);
      assert.equal(err.status, 409);
      assert.match(err.message, /diterima ke stok/i);
      return true;
    }
  );

  assert.throws(
    () => invoiceDatabaseError({ message: "INVOICE_BATCH_DEPENDENCY" }),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseInvoiceError);
      assert.equal(err.status, 409);
      assert.match(err.message, /batch/i);
      return true;
    }
  );
});
