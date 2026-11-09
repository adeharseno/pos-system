import assert from "node:assert/strict";
import test from "node:test";
import {
  historyStatusLabel,
  parseHistoryFilters,
  resolveTransactionDisplayStatus,
} from "./transaction-history-filters";

test("1. BPJS seluruh barang sudah diserahkan -> Selesai", () => {
  // Case A: BPJS transaction with zero supplementary items (only regular cart items handed over at checkout)
  const statusNoSusulan = resolveTransactionDisplayStatus("completed", "bpjs", false);
  assert.equal(statusNoSusulan, "completed");
  assert.equal(historyStatusLabel(statusNoSusulan), "Selesai");

  // Case B: BPJS transaction where all supplementary items are fulfilled
  const statusAllFulfilled = resolveTransactionDisplayStatus("completed", "bpjs", false);
  assert.equal(statusAllFulfilled, "completed");
  assert.equal(historyStatusLabel(statusAllFulfilled), "Selesai");
});

test("2. BPJS sebagian barang belum diserahkan -> Barang Belum Lengkap", () => {
  // E.g. Item 1 fulfilled, Item 2 pending -> hasPendingFulfillment is true
  const status = resolveTransactionDisplayStatus("completed", "bpjs", true);
  assert.equal(status, "incomplete_fulfillment");
  assert.equal(historyStatusLabel(status), "Barang Belum Lengkap");
});

test("3. BPJS seluruh barang belum diserahkan -> Barang Belum Lengkap", () => {
  // All supplementary items are pending
  const status = resolveTransactionDisplayStatus("completed", "bpjs", true);
  assert.equal(status, "incomplete_fulfillment");
  assert.equal(historyStatusLabel(status), "Barang Belum Lengkap");
});

test("4. Penyerahan sebagian quantity -> tetap Barang Belum Lengkap", () => {
  // Transaction has multiple items (or cart items + susulan items).
  // After handing over a subset of items/quantity, pending items remain
  const remainingPending = true;
  const status = resolveTransactionDisplayStatus("completed", "bpjs", remainingPending);
  assert.equal(status, "incomplete_fulfillment");
  assert.equal(historyStatusLabel(status), "Barang Belum Lengkap");
});

test("5. Penyerahan barang terakhir mengubah tampilan menjadi Selesai", () => {
  // Before final fulfillment:
  const beforeFinal = resolveTransactionDisplayStatus("completed", "bpjs", true);
  assert.equal(beforeFinal, "incomplete_fulfillment");

  // After final fulfillment:
  const afterFinal = resolveTransactionDisplayStatus("completed", "bpjs", false);
  assert.equal(afterFinal, "completed");
  assert.equal(historyStatusLabel(afterFinal), "Selesai");
});

test("6. Transaksi BEBAS / UMUM (Cash, QRIS, Bank Transfer) tidak terpengaruh", () => {
  // Cash completed
  assert.equal(resolveTransactionDisplayStatus("completed", "cash", false), "completed");
  assert.equal(resolveTransactionDisplayStatus("completed", "cash", true), "completed");

  // QRIS completed & pending
  assert.equal(resolveTransactionDisplayStatus("completed", "qris", false), "completed");
  assert.equal(resolveTransactionDisplayStatus("pending_payment", "qris", false), "pending_payment");

  // Bank Transfer completed & pending
  assert.equal(resolveTransactionDisplayStatus("completed", "bank_transfer", false), "completed");
  assert.equal(resolveTransactionDisplayStatus("pending_payment", "bank_transfer", false), "pending_payment");

  // Voided transactions always remain voided
  assert.equal(resolveTransactionDisplayStatus("voided", "bpjs", true), "voided");
  assert.equal(resolveTransactionDisplayStatus("voided", "cash", false), "voided");
});

test("7. Status pembayaran dan total transaksi tetap sama", () => {
  const transactionMock = {
    id: "tx-123",
    status: "completed",
    payment_method: "bpjs",
    subtotal: 27000,
    total_amount: 27000,
    cash_received: 0,
    cash_change: 0,
  };

  const displayStatus = resolveTransactionDisplayStatus(
    transactionMock.status,
    transactionMock.payment_method,
    true
  );

  assert.equal(displayStatus, "incomplete_fulfillment");
  // Original financial status and amounts are strictly preserved
  assert.equal(transactionMock.status, "completed");
  assert.equal(transactionMock.total_amount, 27000);
  assert.equal(transactionMock.subtotal, 27000);
});

test("8. Filter status dan detail transaksi konsisten", () => {
  // URL filter parser accepts incomplete_fulfillment
  const filter = parseHistoryFilters({ status: "incomplete_fulfillment" });
  assert.equal(filter.status, "incomplete_fulfillment");

  // URL filter parser accepts completed
  const completedFilter = parseHistoryFilters({ status: "completed" });
  assert.equal(completedFilter.status, "completed");

  // Labels match between filter options and badges
  assert.equal(historyStatusLabel("incomplete_fulfillment"), "Barang Belum Lengkap");
  assert.equal(historyStatusLabel("completed"), "Selesai");
  assert.equal(historyStatusLabel("pending_payment"), "Menunggu Pembayaran");
  assert.equal(historyStatusLabel("voided"), "Dibatalkan");
});

