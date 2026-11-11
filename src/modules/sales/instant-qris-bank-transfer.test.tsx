import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CartLine } from "./cart";
import { acquireSubmissionLock, releaseSubmissionLock } from "./checkout-reliability";
import { buildBankTransferCheckoutPayload, buildQrisCheckoutPayload, checkoutErrorMessage } from "./checkout-ui";
import { checkoutInputFromBody } from "./checkout-request";
import { CheckoutPanel } from "./components/checkout-panel";
import { CheckoutSuccess } from "./components/checkout-success";
import { CashierWorkspace } from "./components/cashier-workspace";
import { buildReceiptViewModel, receiptStatusLabel, resolveReceiptTotals, type ReceiptTransactionRow } from "./receipt";
import { toCheckoutRpcArgs } from "./rpc-contract";
import { validateCheckoutInput } from "./schemas";
import { transactionActionVisibility, transactionPrintLabel } from "./transaction-detail-ui";
import { historyStatusLabel } from "./transaction-history-filters";

const sampleCart: CartLine[] = [
  {
    productId: "11111111-1111-4111-8111-111111111111",
    productName: "G METFORMIN 500 TAB",
    productUnitId: "22222222-2222-4222-8222-222222222222",
    unitLabel: "Strip",
    conversionToBase: 10,
    displayedUnitPrice: 22500,
    quantity: 2,
    requiresPrescription: false,
  },
];

const employeeId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";

test("CheckoutPanel QRIS view omits manual payment warning box and keeps core controls", () => {
  const html = renderToStaticMarkup(
    <CheckoutPanel
      cart={sampleCart}
      estimatedTotal={45000}
      initialMethod="qris"
      onClose={() => {}}
      onImmediateSuccess={() => {}}
      onInsufficientStock={async () => ""}
    />,
  );

  assert.match(html, /Periksa Pesanan/);
  assert.match(html, /G METFORMIN 500 TAB/);
  assert.match(html, /2 × Strip/);
  assert.match(html, /45\.000/);
  assert.match(html, /Kategori Penjualan/);
  assert.match(html, /BEBAS/);
  assert.match(html, /UMUM/);
  assert.match(html, /BPJS/);
  assert.match(html, /Tunai/);
  assert.match(html, /QRIS/);
  assert.match(html, /Transfer Bank/);
  assert.match(html, /Buat Transaksi QRIS/);

  assert.doesNotMatch(html, /Pembayaran QRIS manual/i);
  assert.doesNotMatch(html, /Pembayaran transfer bank manual/i);
  assert.doesNotMatch(html, /verifikasi secara eksternal/i);
  assert.doesNotMatch(html, /berstatus menunggu pembayaran/i);
});

test("CheckoutPanel Bank Transfer view omits manual payment warning box and keeps core controls", () => {
  const html = renderToStaticMarkup(
    <CheckoutPanel
      cart={sampleCart}
      estimatedTotal={45000}
      initialMethod="bank_transfer"
      onClose={() => {}}
      onImmediateSuccess={() => {}}
      onInsufficientStock={async () => ""}
    />,
  );

  assert.match(html, /Periksa Pesanan/);
  assert.match(html, /G METFORMIN 500 TAB/);
  assert.match(html, /45\.000/);
  assert.match(html, /Kategori Penjualan/);
  assert.match(html, /Buat Transaksi Transfer Bank/);

  assert.doesNotMatch(html, /Pembayaran transfer bank manual/i);
  assert.doesNotMatch(html, /Pembayaran QRIS manual/i);
  assert.doesNotMatch(html, /verifikasi secara eksternal/i);
  assert.doesNotMatch(html, /berstatus menunggu pembayaran/i);
});

test("CheckoutSuccess displays completed QRIS transaction with auto-print and without cash change", () => {
  const txId = "55555555-5555-4555-8555-555555555555";
  const html = renderToStaticMarkup(
    <CheckoutSuccess
      result={{
        transactionId: txId,
        invoiceNumber: "INV-20261111-0101",
        status: "completed",
        subtotal: 45000,
        taxAmount: 0,
        totalAmount: 45000,
        cashChange: null,
      }}
      paymentMethod="qris"
      onNewSale={() => {}}
    />,
  );

  assert.match(html, /Transaksi Berhasil/);
  assert.match(html, /INV-20261111-0101/);
  assert.match(html, /45\.000/);
  assert.match(html, /Metode pembayaran/);
  assert.match(html, />QRIS</);
  assert.match(html, /Pembayaran dikonfirmasi/);
  assert.match(html, /Cetak Struk/);
  assert.match(html, new RegExp(`/transactions/${txId}/receipt`));
  assert.match(html, /Lihat Struk/);
  assert.match(html, /Transaksi Baru/);

  assert.doesNotMatch(html, /Uang diterima/);
  assert.doesNotMatch(html, /Kembalian/);
  assert.doesNotMatch(html, /Menunggu Pembayaran/);
  assert.doesNotMatch(html, /Konfirmasi Pembayaran/);
});

test("CheckoutSuccess displays completed Transfer Bank transaction with auto-print and without cash change", () => {
  const txId = "66666666-6666-4666-8666-666666666666";
  const html = renderToStaticMarkup(
    <CheckoutSuccess
      result={{
        transactionId: txId,
        invoiceNumber: "INV-20261111-0102",
        status: "completed",
        subtotal: 45000,
        taxAmount: 0,
        totalAmount: 45000,
        cashChange: null,
      }}
      paymentMethod="bank_transfer"
      onNewSale={() => {}}
    />,
  );

  assert.match(html, /Transaksi Berhasil/);
  assert.match(html, /INV-20261111-0102/);
  assert.match(html, /45\.000/);
  assert.match(html, />Transfer Bank</);
  assert.match(html, /Pembayaran dikonfirmasi/);
  assert.match(html, /Cetak Struk/);
  assert.match(html, new RegExp(`/transactions/${txId}/receipt`));
  assert.match(html, /Lihat Struk/);
  assert.match(html, /Transaksi Baru/);

  assert.doesNotMatch(html, /Uang diterima/);
  assert.doesNotMatch(html, /Kembalian/);
  assert.doesNotMatch(html, /Menunggu Pembayaran/);
  assert.doesNotMatch(html, /Konfirmasi Pembayaran/);
});

test("CashierWorkspace no longer mounts any Menunggu Pembayaran popup flow", () => {
  const html = renderToStaticMarkup(<CashierWorkspace />);
  assert.doesNotMatch(html, /Menunggu Pembayaran QRIS/);
  assert.doesNotMatch(html, /Menunggu Pembayaran Transfer Bank/);
});

test("QRIS and Transfer Bank checkout schemas & RPC args omit cash and tax while preserving method", () => {
  for (const method of ["qris", "bank_transfer"] as const) {
    const payload =
      method === "qris"
        ? buildQrisCheckoutPayload(sampleCart, { category: "bebas" })
        : buildBankTransferCheckoutPayload(sampleCart, { category: "bebas" });
    assert.equal("cash_received" in payload, false);

    const input = checkoutInputFromBody(
      { ...payload, request_id: requestId },
      employeeId,
    );
    const validated = validateCheckoutInput(input);
    const args = toCheckoutRpcArgs(validated);

    assert.equal(args.p_payment_method, method);
    assert.equal(args.p_cash_received, undefined);
    assert.equal(args.p_request_id, requestId);
    assert.equal((args.p_prescription as Record<string, unknown> | undefined)?.prescription_category, "bebas");
  }
});

test("submission lock prevents duplicate concurrent submit while preserving error recovery", () => {
  const lock = { current: false };
  assert.equal(acquireSubmissionLock(lock), true);
  assert.equal(acquireSubmissionLock(lock), false);
  releaseSubmissionLock(lock);
  assert.equal(acquireSubmissionLock(lock), true);
  assert.match(checkoutErrorMessage("INSUFFICIENT_STOCK"), /Stok/i);
});

test("settled QRIS & Bank Transfer receipts show LUNAS without cash change or zero tax, while legacy pending stays compatible", () => {
  for (const method of ["qris", "bank_transfer"] as const) {
    const row: ReceiptTransactionRow = {
      id: "77777777-7777-4777-8777-777777777777",
      invoice_number: "INV-20261111-0103",
      created_at: "2026-11-11T07:00:00.000Z",
      subtotal: 45000,
      tax_amount: 0,
      total_amount: 45000,
      payment_method: method,
      cash_received: null,
      cash_change: null,
      status: "completed",
      employees: { full_name: "Lydia" },
      transaction_prescriptions: [
        {
          prescription_category: "bebas",
          patient_name: null,
          bpjs_number: null,
          prescription_number: null,
          prescription_origin: null,
          prescription_date: null,
        },
      ],
      transaction_items: [
        {
          quantity_in_unit: 2,
          unit_price: 22500,
          total_amount: 45000,
          product_name_snapshot: "G METFORMIN 500 TAB",
          unit_name_snapshot: "Strip",
        },
      ],
    };

    const vm = buildReceiptViewModel(row);
    const totals = resolveReceiptTotals(vm, []);
    assert.equal(vm.paymentMethod, method);
    assert.equal(receiptStatusLabel(vm.status), "LUNAS");
    assert.equal("cashReceived" in vm, false);
    assert.equal("cashChange" in vm, false);
    assert.deepEqual(totals, { subtotal: 45000, taxAmount: 0, total: 45000 });
  }

  // Legacy historical pending_payment remains viewable & actionable for admin cleanup
  assert.equal(receiptStatusLabel("pending_payment"), "MENUNGGU PEMBAYARAN");
  assert.equal(historyStatusLabel("pending_payment"), "Menunggu Pembayaran");
  assert.deepEqual(transactionActionVisibility("pending_payment", "qris", false), {
    confirm: true,
    void: true,
  });
  assert.deepEqual(transactionActionVisibility("pending_payment", "bank_transfer", false), {
    confirm: true,
    void: true,
  });
  assert.equal(transactionPrintLabel("pending_payment", "qris"), "Cetak Invoice");
  assert.deepEqual(transactionActionVisibility("completed", "qris", false), {
    confirm: false,
    void: false,
  });
  assert.deepEqual(transactionActionVisibility("completed", "bank_transfer", false), {
    confirm: false,
    void: false,
  });
  assert.equal(transactionPrintLabel("completed", "qris"), "Cetak Struk");
  assert.equal(transactionPrintLabel("completed", "bank_transfer"), "Cetak Struk");
});
