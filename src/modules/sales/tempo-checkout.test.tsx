import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutPanel } from "./components/checkout-panel";
import { CheckoutSuccess } from "./components/checkout-success";
import { paymentLabel } from "./components/transaction-presentation";
import type { CartLine } from "./cart";
import { checkoutInputFromBody } from "./checkout-request";
import { buildPanelCheckoutPayload, buildTempoCheckoutPayload, checkoutErrorMessage, validateTempoDueDate } from "./checkout-ui";
import { buildReceiptViewModel, receivableStatusLabel } from "./receipt";
import { toCheckoutRpcArgs } from "./rpc-contract";
import { validateCheckoutInput } from "./schemas";
import { transactionActionVisibility, transactionPrintLabel } from "./transaction-detail-ui";
import { parseHistoryFilters } from "./transaction-history-filters";

const sampleCart: CartLine[] = [
  {
    productUnitId: "11111111-1111-4111-8111-111111111111",
    productId: "prod-1",
    productName: "Paracetamol 500mg",
    unitLabel: "Strip",
    conversionToBase: 10,
    quantity: 2,
    displayedUnitPrice: 12000,
    requiresPrescription: false,
  },
];

const employeeId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";

test("checkoutInputFromBody and validateCheckoutInput accept TEMPO with customer and dueDate", () => {
  const payload = buildTempoCheckoutPayload(
    sampleCart,
    { category: "bebas" },
    customerId,
    "2099-05-20"
  );
  const parsed = checkoutInputFromBody({ ...payload, request_id: requestId }, employeeId);
  assert.equal(parsed.paymentMethod, "tempo");
  assert.equal(parsed.customerId, customerId);
  assert.equal(parsed.dueDate, "2099-05-20");
  assert.equal(parsed.cashReceived, undefined);

  const validated = validateCheckoutInput(parsed, "2099-05-10");
  const rpcArgs = toCheckoutRpcArgs(validated);
  assert.equal(rpcArgs.p_customer_id, customerId);
  assert.equal(rpcArgs.p_due_date, "2099-05-20");
});

test("TEMPO validation rejects BPJS combination, missing/past due date, and non-tempo customerId", () => {
  assert.throws(
    () =>
      checkoutInputFromBody(
        {
          payment_method: "tempo",
          customer_id: customerId,
          due_date: "2099-05-20",
          items: [{ product_unit_id: sampleCart[0].productUnitId, quantity: 1 }],
          prescription: { prescription_category: "bpjs", bpjs_number: "0001" },
        },
        employeeId
      ),
    /TEMPO cannot be combined with BPJS/
  );

  assert.throws(
    () =>
      validateCheckoutInput(
        {
          requestId,
          employeeId,
          paymentMethod: "tempo",
          customerId,
          dueDate: "2099-05-01",
          items: [{ productUnitId: sampleCart[0].productUnitId, quantity: 1 }],
          prescription: { category: "bebas" },
        },
        "2099-05-10"
      ),
    /dueDate cannot be earlier than transaction date/
  );

  assert.throws(
    () =>
      validateCheckoutInput({
        requestId,
        employeeId,
        paymentMethod: "cash",
        cashReceived: 24000,
        customerId,
        items: [{ productUnitId: sampleCart[0].productUnitId, quantity: 1 }],
        prescription: { category: "bebas" },
      }),
    /only allowed for TEMPO/
  );

  assert.ok(validateTempoDueDate("", "2026-11-11"));
  assert.ok(validateTempoDueDate("2026-02-30", "2026-11-11"));
  assert.ok(validateTempoDueDate("2026-11-10", "2026-11-11"));
  assert.equal(validateTempoDueDate("2026-11-11", "2026-11-11"), null);
  assert.match(checkoutErrorMessage("TEMPO_TRANSACTION_REQUIRES_RETURN"), /retur/i);
});

test("CheckoutPanel TEMPO view shows 4 payment buttons, customer/dueDate inputs, Total Piutang, and hides cash fields", () => {
  const html = renderToStaticMarkup(
    <CheckoutPanel
      cart={sampleCart}
      estimatedTotal={24000}
      initialMethod="tempo"
      onClose={() => {}}
      onImmediateSuccess={() => {}}
      onInsufficientStock={async () => "ok"}
    />
  );

  assert.ok(html.includes("Tunai"));
  assert.ok(html.includes("QRIS"));
  assert.ok(html.includes("Transfer Bank"));
  assert.ok(html.includes("TEMPO"));
  assert.ok(html.includes("sm:grid-cols-4"));

  assert.ok(html.includes("Pembeli (Master Customer)"));
  assert.ok(html.includes("Tambah Customer Baru"));
  assert.ok(html.includes("Tanggal Jatuh Tempo"));
  assert.ok(html.includes("+7 Hari"));
  assert.ok(html.includes("Total Piutang"));
  assert.ok(html.includes("Rp 24.000"));
  assert.ok(html.includes("Buat Transaksi Tempo"));
  assert.ok(html.includes("disabled"));

  assert.ok(!html.includes("Uang Diterima"));
  assert.ok(!html.includes("Kembalian"));
});

test("CheckoutSuccess TEMPO view renders BELUM LUNAS, customer, due date, Cetak Invoice, and omits cash lines", () => {
  const html = renderToStaticMarkup(
    <CheckoutSuccess
      paymentMethod="tempo"
      result={{
        transactionId: "tx-tempo-1",
        invoiceNumber: "INV-20261111-0099",
        status: "completed",
        subtotal: 24000,
        taxAmount: 0,
        totalAmount: 24000,
        cashChange: null,
        receivableId: "rec-1",
        customerId,
        customerName: "Ibu Sari",
        dueDate: "2026-11-25",
        paymentStatus: "unpaid",
      }}
      onNewSale={() => {}}
    />
  );

  assert.ok(html.includes("Transaksi Berhasil"));
  assert.ok(html.includes("INV-20261111-0099"));
  assert.ok(html.includes("TEMPO"));
  assert.ok(html.includes("Ibu Sari"));
  assert.ok(html.includes("25 Nov 2026"));
  assert.ok(html.includes("BELUM LUNAS"));
  assert.ok(html.includes("Sisa Tagihan"));
  assert.ok(html.includes("Cetak Invoice"));
  assert.ok(html.includes("Lihat Invoice"));
  assert.ok(!html.includes("Uang diterima"));
  assert.ok(!html.includes("Kembalian"));
});

test("Receipt model, detail actions, labels, and filters support TEMPO without enabling void or confirm", () => {
  const view = buildReceiptViewModel({
    id: "tx-tempo-1",
    invoice_number: "INV-20261111-0099",
    created_at: "2026-11-11T08:00:00Z",
    subtotal: 24000,
    tax_amount: 0,
    total_amount: 24000,
    payment_method: "tempo",
    cash_received: null,
    cash_change: null,
    status: "completed",
    employees: { full_name: "Kasir Satu" },
    customers: { name: "Ibu Sari", phone: "08123456789" },
    customer_receivables: {
      id: "rec-1",
      original_amount: 24000,
      paid_amount: 4000,
      credited_return_amount: 0,
      outstanding_amount: 20000,
      due_date: "2026-11-25",
      payment_status: "partial",
    },
    transaction_prescriptions: [],
    transaction_items: [
      {
        quantity_in_unit: 2,
        unit_price: 12000,
        total_amount: 24000,
        product_name_snapshot: "Paracetamol 500mg",
        unit_name_snapshot: "Strip",
      },
    ],
  });

  assert.equal(view.customerName, "Ibu Sari");
  assert.equal(view.customerPhone, "08123456789");
  assert.equal(view.receivable?.outstandingAmount, 20000);
  assert.equal(receivableStatusLabel("unpaid"), "BELUM LUNAS");
  assert.equal(receivableStatusLabel("partial"), "SEBAGIAN");
  assert.equal(receivableStatusLabel("paid"), "LUNAS");

  assert.deepEqual(transactionActionVisibility("completed", "tempo", false), {
    confirm: false,
    void: false,
  });
  assert.equal(transactionPrintLabel("completed", "tempo"), "Cetak Invoice");
  assert.equal(paymentLabel("tempo"), "TEMPO");
  assert.equal(parseHistoryFilters({ payment: "tempo" }).payment, "tempo");
});

test("buildPanelCheckoutPayload dispatches TEMPO with customerId and dueDate instead of falling through to bank_transfer", () => {
  const payload = buildPanelCheckoutPayload({
    category: "bebas",
    method: "tempo",
    cart: sampleCart,
    cashReceived: null,
    prescription: { category: "bebas" },
    customerId,
    dueDate: "2099-05-20",
  });
  assert.equal(payload.payment_method, "tempo");
  assert.equal("customer_id" in payload && payload.customer_id, customerId);
  assert.equal("due_date" in payload && payload.due_date, "2099-05-20");

  const transferPayload = buildPanelCheckoutPayload({
    category: "bebas",
    method: "bank_transfer",
    cart: sampleCart,
    cashReceived: null,
    prescription: { category: "bebas" },
  });
  assert.equal(transferPayload.payment_method, "bank_transfer");
});

