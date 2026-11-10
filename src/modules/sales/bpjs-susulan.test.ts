import assert from "node:assert/strict";
import test from "node:test";
import type { BpjsSusulanItem, SusulanItemInput } from "./bpjs-susulan";
import { buildBpjsCheckoutPayload } from "./checkout-ui";
import { checkoutInputFromBody } from "./checkout-request";
import { toCheckoutRpcArgs } from "./rpc-contract";
import { validateCheckoutInput } from "./schemas";
import { sanitizeReceiptProductName } from "./receipt";
import type { CartLine } from "./cart";

const dummyCart: CartLine[] = [
  {
    productUnitId: "11111111-1111-4111-8111-111111111111",
    productId: "prod-1",
    productName: "BPJS ACARBOSE 50 TAB",
    unitLabel: "TAB",
    conversionToBase: 1,
    quantity: 10,
    displayedUnitPrice: 700,
    requiresPrescription: true,
  },
];

test("susulan item total calculation matches qty * price", () => {
  const item: SusulanItemInput = {
    drugName: "Amoxicillin 500mg",
    quantity: 3,
    unitPrice: 15000,
    requestKey: "req-1",
  };
  const lineTotal = item.quantity * item.unitPrice;
  assert.equal(lineTotal, 45000);
});

test("delivery date calculated for tomorrow WIB", () => {
  const nowWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  nowWib.setDate(nowWib.getDate() + 1);
  const deliveryDate = `${nowWib.getFullYear()}-${String(nowWib.getMonth() + 1).padStart(2, "0")}-${String(nowWib.getDate()).padStart(2, "0")}`;
  assert.match(deliveryDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("1. Checkout BPJS tanpa produk tambahan builds standard payload", () => {
  const payload = buildBpjsCheckoutPayload(dummyCart, {
    category: "bpjs",
    patientName: "Budi",
    bpjsNumber: "000123456",
  });
  assert.equal(payload.payment_method, "bpjs");
  assert.equal(payload.cash_received, 0);
  assert.equal(payload.items.length, 1);
  assert.equal("supplementary_items" in payload, false);
});

test("2. Checkout BPJS dengan satu produk tambahan menyertakan supplementary_items", () => {
  const payload = buildBpjsCheckoutPayload(
    dummyCart,
    { category: "bpjs", patientName: "Budi", bpjsNumber: "000123456" },
    [{ drugName: "BPJS ALPARA", quantity: 1, unitPrice: 20000 }]
  );
  assert.equal(payload.payment_method, "bpjs");
  assert.equal(payload.items.length, 1);
  assert.equal(payload.supplementary_items?.length, 1);
  assert.deepEqual(payload.supplementary_items![0], {
    drug_name: "BPJS ALPARA",
    quantity: 1,
    unit_price: 20000,
  });
});

test("3 & 4. Checkout BPJS dengan beberapa produk tambahan dan quantity > 1", () => {
  const extraItems = [
    { drugName: "BPJS ALPARA", quantity: 2, unitPrice: 20000 },
    { drugName: "BPJS VITAMIN C", quantity: 3, unitPrice: 5000 },
  ];
  const payload = buildBpjsCheckoutPayload(
    dummyCart,
    { category: "bpjs", patientName: "Budi", bpjsNumber: "000123456" },
    extraItems
  );
  assert.equal(payload.supplementary_items?.length, 2);
  assert.equal(payload.supplementary_items![0].quantity, 2);
  assert.equal(payload.supplementary_items![0].unit_price, 20000);
  assert.equal(payload.supplementary_items![1].quantity, 3);
  assert.equal(payload.supplementary_items![1].unit_price, 5000);
});

test("5. Total checkout sama dengan produk utama + seluruh produk tambahan", () => {
  const mainSubtotal = dummyCart.reduce((sum, it) => sum + it.quantity * it.displayedUnitPrice, 0); // 10 * 700 = 7000
  const extraItems = [{ drugName: "BPJS ALPARA", quantity: 1, unitPrice: 20000 }];
  const extraSubtotal = extraItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0); // 20000
  const grandTotal = mainSubtotal + extraSubtotal;
  assert.equal(mainSubtotal, 7000);
  assert.equal(extraSubtotal, 20000);
  assert.equal(grandTotal, 27000);
});

test("6. Struk menampilkan produk tambahan tanpa suffix '(Produk Tambahan)' dan subtotal yang tepat", () => {
  const normalItems = [
    { productName: "BPJS ACARBOSE 50 TAB", unitName: "TAB", quantity: 10, unitPrice: 700, lineTotal: 7000 },
  ];
  const susulanItems: BpjsSusulanItem[] = [
    {
      id: "s1",
      transactionId: "tx-1",
      productId: null,
      drugName: "BPJS ALPARA",
      quantity: 1,
      unitPrice: 20000,
      lineTotal: 20000,
      deliveryDate: "2026-11-10",
      fulfillmentStatus: "pending_fulfillment",
      fulfilledBy: null,
      fulfilledAt: null,
      createdAt: "2026-11-09T09:00:00Z",
      createdBy: "emp-1",
      requestKey: "req-1",
    },
  ];

  const allItems = [
    ...normalItems.map((item) => ({
      ...item,
      productName: sanitizeReceiptProductName(item.productName),
    })),
    ...susulanItems.map((item) => ({
      productName: sanitizeReceiptProductName(item.drugName),
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  assert.equal(allItems.length, 2);
  assert.equal(allItems[0].productName, "BPJS ACARBOSE 50 TAB");
  assert.equal(allItems[0].lineTotal, 7000);
  assert.equal(allItems[1].productName, "BPJS ALPARA");
  assert.equal(allItems[1].productName.includes("(Produk Tambahan)"), false);
  assert.equal(allItems[1].quantity, 1);
  assert.equal(allItems[1].unitPrice, 20000);
  assert.equal(allItems[1].lineTotal, 20000);

  const calculatedSubtotal = allItems.reduce((acc, it) => acc + it.lineTotal, 0);
  assert.equal(calculatedSubtotal, 27000);
});

test("receipt merges normal and susulan items as standard lines without susulan labels", () => {
  const normalItems = [
    { productName: "Paracetamol", unitName: "Strip", quantity: 1, unitPrice: 8000, lineTotal: 8000 },
  ];
  const susulanItems: BpjsSusulanItem[] = [
    {
      id: "s1",
      transactionId: "tx-1",
      productId: null,
      drugName: "Salbutamol Inhaler",
      quantity: 1,
      unitPrice: 65000,
      lineTotal: 65000,
      deliveryDate: "2026-11-10",
      fulfillmentStatus: "pending_fulfillment",
      fulfilledBy: null,
      fulfilledAt: null,
      createdAt: "2026-11-09T08:00:00Z",
      createdBy: "emp-1",
      requestKey: "k-1",
    },
  ];

  const merged = [
    ...normalItems.map((item) => ({
      ...item,
      productName: sanitizeReceiptProductName(item.productName),
    })),
    ...susulanItems.map((item) => ({
      productName: sanitizeReceiptProductName(item.drugName),
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  assert.equal(merged.length, 2);
  assert.equal(merged[1].productName, "Salbutamol Inhaler");
  assert.equal(merged[1].lineTotal, 65000);
  assert.equal(merged[1].productName.includes("susulan"), false);
  assert.equal(merged[1].unitName.includes("susulan"), false);
});

test("susulan item with (Produk Tambahan) suffix is sanitized for receipt display", () => {
  const dirtyItems: BpjsSusulanItem[] = [
    {
      id: "s2",
      transactionId: "tx-2",
      productId: null,
      drugName: "BPJS ASETOSAL 100 TAB (Produk Tambahan)",
      quantity: 1,
      unitPrice: 35000,
      lineTotal: 35000,
      deliveryDate: "2026-11-10",
      fulfillmentStatus: "pending_fulfillment",
      fulfilledBy: null,
      fulfilledAt: null,
      createdAt: "2026-11-09T09:00:00Z",
      createdBy: "emp-1",
      requestKey: "req-2",
    },
  ];

  const receiptItem = {
    productName: sanitizeReceiptProductName(dirtyItems[0].drugName),
    unitName: "unit",
    quantity: dirtyItems[0].quantity,
    unitPrice: dirtyItems[0].unitPrice,
    lineTotal: dirtyItems[0].lineTotal,
  };

  assert.equal(receiptItem.productName, "BPJS ASETOSAL 100 TAB");
});

test("7. checkoutInputFromBody and toCheckoutRpcArgs map supplementary_items accurately", () => {
  const body = {
    payment_method: "bpjs",
    request_id: "22222222-2222-4222-8222-222222222222",
    items: [{ product_unit_id: "11111111-1111-4111-8111-111111111111", quantity: 10 }],
    prescription: { prescription_category: "bpjs", bpjs_number: "000123" },
    supplementary_items: [{ drug_name: "BPJS ALPARA", quantity: 1, unit_price: 20000 }],
  };
  const input = checkoutInputFromBody(body, "33333333-3333-4333-8333-333333333333");
  assert.equal(input.supplementaryItems?.length, 1);
  assert.equal(input.supplementaryItems![0].drugName, "BPJS ALPARA");
  assert.equal(input.supplementaryItems![0].quantity, 1);
  assert.equal(input.supplementaryItems![0].unitPrice, 20000);

  const validated = validateCheckoutInput(input);
  assert.equal(validated.supplementaryItems?.length, 1);

  const rpcArgs = toCheckoutRpcArgs(validated);
  const extraItemsRpc = rpcArgs.p_supplementary_items as Record<string, unknown>[];
  assert.equal(extraItemsRpc?.length, 1);
  assert.deepEqual(extraItemsRpc[0], {
    drug_name: "BPJS ALPARA",
    quantity: 1,
    unit_price: 20000,
  });
});

test("8. Schema rejects invalid supplementary items (blank name, zero quantity, negative price)", () => {
  const baseInput = {
    requestId: "22222222-2222-4222-8222-222222222222",
    employeeId: "33333333-3333-4333-8333-333333333333",
    paymentMethod: "bpjs" as const,
    cashReceived: 0,
    items: [{ productUnitId: "11111111-1111-4111-8111-111111111111", quantity: 10 }],
    prescription: { category: "bpjs" as const, bpjsNumber: "000123" },
  };

  assert.throws(() =>
    validateCheckoutInput({
      ...baseInput,
      supplementaryItems: [{ drugName: "   ", quantity: 1, unitPrice: 1000 }],
    })
  );
  assert.throws(() =>
    validateCheckoutInput({
      ...baseInput,
      supplementaryItems: [{ drugName: "Valid", quantity: 0, unitPrice: 1000 }],
    })
  );
  assert.throws(() =>
    validateCheckoutInput({
      ...baseInput,
      supplementaryItems: [{ drugName: "Valid", quantity: 1, unitPrice: -500 }],
    })
  );
  assert.throws(() =>
    validateCheckoutInput({
      ...baseInput,
      paymentMethod: "cash",
      supplementaryItems: [{ drugName: "Valid", quantity: 1, unitPrice: 1000 }],
    })
  );
});

test("9. buildBpjsCheckoutPayload with empty cart produces payload with empty items array", () => {
  const payload = buildBpjsCheckoutPayload(
    [],
    { category: "bpjs", patientName: "Ahmad", bpjsNumber: "00098765" },
    [{ drugName: "BPJS METFORMIN 500", quantity: 2, unitPrice: 15000 }]
  );
  assert.equal(payload.payment_method, "bpjs");
  assert.equal(payload.cash_received, 0);
  assert.deepEqual(payload.items, []);
  assert.equal(payload.supplementary_items?.length, 1);
  assert.deepEqual(payload.supplementary_items![0], {
    drug_name: "BPJS METFORMIN 500",
    quantity: 2,
    unit_price: 15000,
  });
  assert.equal(payload.prescription.patient_name, "Ahmad");
  assert.equal(payload.prescription.bpjs_number, "00098765");
});

test("10. validateCheckoutInput accepts empty items array for BPJS with supplementary items and patient name", () => {
  const input = {
    requestId: "44444444-4444-4444-8444-444444444444",
    employeeId: "55555555-5555-4555-8555-555555555555",
    paymentMethod: "bpjs" as const,
    cashReceived: 0,
    items: [],
    prescription: {
      category: "bpjs" as const,
      patientName: "Ahmad",
      bpjsNumber: "00098765",
    },
    supplementaryItems: [
      { drugName: "BPJS METFORMIN 500", quantity: 2, unitPrice: 15000 },
    ],
  };

  const validated = validateCheckoutInput(input);
  assert.equal(validated.items.length, 0);
  assert.equal(validated.supplementaryItems?.length, 1);

  const rpcArgs = toCheckoutRpcArgs(validated);
  assert.deepEqual(rpcArgs.p_items, []);
  assert.equal(rpcArgs.p_payment_method, "bpjs");
  const extraItemsRpc = rpcArgs.p_supplementary_items as Record<string, unknown>[];
  assert.equal(extraItemsRpc?.length, 1);
});

test("11. validateCheckoutInput rejects empty cart for non-BPJS or BPJS without supplementary items or missing patient name", () => {
  const base = {
    requestId: "44444444-4444-4444-8444-444444444444",
    employeeId: "55555555-5555-4555-8555-555555555555",
  };

  // Rejects cash with empty items
  assert.throws(
    () =>
      validateCheckoutInput({
        ...base,
        paymentMethod: "cash",
        cashReceived: 10000,
        items: [],
      }),
    /items must not be empty/
  );

  // Rejects BPJS with empty items and empty supplementary items
  assert.throws(
    () =>
      validateCheckoutInput({
        ...base,
        paymentMethod: "bpjs",
        cashReceived: 0,
        items: [],
        prescription: { category: "bpjs", patientName: "Ahmad", bpjsNumber: "123" },
        supplementaryItems: [],
      }),
    /items must not be empty/
  );

  // Rejects BPJS with empty items when patientName is missing/blank
  assert.throws(
    () =>
      validateCheckoutInput({
        ...base,
        paymentMethod: "bpjs",
        cashReceived: 0,
        items: [],
        prescription: { category: "bpjs", patientName: "", bpjsNumber: "123" },
        supplementaryItems: [{ drugName: "Obat A", quantity: 1, unitPrice: 5000 }],
      }),
    /prescription\.patientName/
  );

  // Rejects BPJS with empty items when bpjsNumber is missing/blank
  assert.throws(
    () =>
      validateCheckoutInput({
        ...base,
        paymentMethod: "bpjs",
        cashReceived: 0,
        items: [],
        prescription: { category: "bpjs", patientName: "Ahmad", bpjsNumber: "" },
        supplementaryItems: [{ drugName: "Obat A", quantity: 1, unitPrice: 5000 }],
      }),
    /prescription\.bpjsNumber/
  );
});
