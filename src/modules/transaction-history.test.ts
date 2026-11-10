import assert from "node:assert/strict";
import test from "node:test";

import {
  historyStatusLabel,
  jakartaToday,
  parseHistoryFilters,
} from "./sales/transaction-history-filters";

test("history filters validate enums, cashier, pagination, and invoice search", () => {
  const result = parseHistoryFilters({
    q: " INV-01 ",
    payment: "cash",
    status: "completed",
    page: "2",
    from: "2026-10-24",
    to: "2026-10-25",
    cashier: "11111111-1111-4111-8111-111111111111",
  });
  assert.deepEqual(result, {
    q: "INV-01",
    payment: "cash",
    status: "completed",
    page: 2,
    limit: 20,
    from: "2026-10-24",
    to: "2026-10-25",
    cashierId: "11111111-1111-4111-8111-111111111111",
  });
});

test("history filters ignore malformed values", () => {
  const result = parseHistoryFilters({
    payment: "wire",
    status: "paid",
    page: "-2",
    from: "24/10/2026",
    cashier: "not-a-uuid",
  });
  assert.equal(result.payment, undefined);
  assert.equal(result.status, undefined);
  assert.equal(result.page, 1);
  assert.equal(result.from, undefined);
  assert.equal(result.cashierId, undefined);
});

test("history accepts bank transfer as a payment filter", () => {
  assert.equal(parseHistoryFilters({ payment: "bank_transfer" }).payment, "bank_transfer");
  assert.equal(parseHistoryFilters({ payment: "bpjs" }).payment, "bpjs");
});

test("history status labels remain explicit", () => {
  assert.equal(historyStatusLabel("completed"), "Selesai");
  assert.equal(historyStatusLabel("incomplete_fulfillment"), "Barang Belum Lengkap");
  assert.equal(historyStatusLabel("pending_payment"), "Menunggu Pembayaran");
  assert.equal(historyStatusLabel("voided"), "Dibatalkan");
});

test("Jakarta today is a plain date and crosses the UTC day boundary", () => {
  assert.equal(jakartaToday(new Date("2026-11-02T18:00:00Z")), "2026-11-03");
  assert.match(jakartaToday(), /^\d{4}-\d{2}-\d{2}$/);
});
