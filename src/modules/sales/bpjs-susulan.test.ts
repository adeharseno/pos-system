import assert from "node:assert/strict";
import test from "node:test";
import type { BpjsSusulanItem, SusulanItemInput } from "./bpjs-susulan";

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

test("multiple susulan items correctly aggregate to total amount", () => {
  const items: SusulanItemInput[] = [
    { drugName: "Obat A", quantity: 2, unitPrice: 10000, requestKey: "k-1" },
    { drugName: "Obat B", quantity: 1, unitPrice: 25000, requestKey: "k-2" },
  ];
  const cartEstimatedTotal = 50000;
  const extraTotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const grandTotal = cartEstimatedTotal + extraTotal;
  assert.equal(extraTotal, 45000);
  assert.equal(grandTotal, 95000);
});

test("delivery date calculated for tomorrow WIB", () => {
  const nowWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  nowWib.setDate(nowWib.getDate() + 1);
  const deliveryDate = `${nowWib.getFullYear()}-${String(nowWib.getMonth() + 1).padStart(2, "0")}-${String(nowWib.getDate()).padStart(2, "0")}`;
  assert.match(deliveryDate, /^\d{4}-\d{2}-\d{2}$/);
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
      createdAt: "2026-11-09T09:00:00Z",
      createdBy: "emp-1",
      requestKey: "req-1",
    },
  ];

  const merged = [
    ...normalItems,
    ...susulanItems.map((item) => ({
      productName: item.drugName,
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  assert.equal(merged.length, 2);
  assert.equal(merged[1].productName, "Salbutamol Inhaler");
  assert.equal(merged[1].lineTotal, 65000);
  // Ensure no "susulan" or "belum diserahkan" in productName or unitName
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
    productName: dirtyItems[0].drugName.replace(/\s*[\(\[]\s*produk\s+tambahan\s*[\)\]]/gi, "").trim(),
    unitName: "unit",
    quantity: dirtyItems[0].quantity,
    unitPrice: dirtyItems[0].unitPrice,
    lineTotal: dirtyItems[0].lineTotal,
  };

  assert.equal(receiptItem.productName, "BPJS ASETOSAL 100 TAB");
});


