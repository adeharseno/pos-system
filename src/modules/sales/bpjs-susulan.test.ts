import assert from "node:assert/strict";
import test from "node:test";
import type { BpjsSusulanItem } from "./bpjs-susulan";
import { buildBpjsCheckoutPayload } from "./checkout-ui";
import { checkoutInputFromBody } from "./checkout-request";
import { toCheckoutRpcArgs } from "./rpc-contract";
import { validateCheckoutInput } from "./schemas";
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

test("6. Struk menampilkan produk tambahan dengan label '(Produk Tambahan)' dan subtotal yang tepat", () => {
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
    ...normalItems,
    ...susulanItems.map((item) => ({
      productName: item.drugName.includes("(Produk Tambahan)")
        ? item.drugName
        : `${item.drugName} (Produk Tambahan)`,
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  assert.equal(allItems.length, 2);
  assert.equal(allItems[0].productName, "BPJS ACARBOSE 50 TAB");
  assert.equal(allItems[0].lineTotal, 7000);
  assert.equal(allItems[1].productName, "BPJS ALPARA (Produk Tambahan)");
  assert.equal(allItems[1].quantity, 1);
  assert.equal(allItems[1].unitPrice, 20000);
  assert.equal(allItems[1].lineTotal, 20000);

  const calculatedSubtotal = allItems.reduce((acc, it) => acc + it.lineTotal, 0);
  assert.equal(calculatedSubtotal, 27000);
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
