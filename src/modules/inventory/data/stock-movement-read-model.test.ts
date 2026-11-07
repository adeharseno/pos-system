import assert from "node:assert/strict";
import test from "node:test";
import { formatStockMovementWib, parseStockMovementReadModel } from "./stock-movement-read-model-parser";

const sale = {
  eventId: "sale:11111111-1111-4111-8111-111111111111", occurredAt: "2026-11-06T08:30:00+00:00",
  type: "out" as const, quantity: 3, unit: "Tablet", employeeName: "Kasir A", supplierName: null,
  referenceNumber: "INV-001", referenceUrl: "/transactions/22222222-2222-4222-8222-222222222222",
};
const receipt = {
  eventId: "receipt:33333333-3333-4333-8333-333333333333", occurredAt: "2026-11-05T08:30:00+00:00",
  type: "in" as const, quantity: 24, unit: "Tablet", employeeName: "Owner", supplierName: "Pemasok A",
  referenceNumber: "PO-001", referenceUrl: "/purchase-invoices/44444444-4444-4444-8444-444444444444",
};
const voided = {
  ...sale, eventId: "void:55555555-5555-4555-8555-555555555555", type: "void" as const,
  occurredAt: "2026-11-06T09:30:00+00:00", quantity: 3,
};
const customerReturn = {
  ...sale, eventId: "customer-return:66666666-6666-4666-8666-666666666666",
  type: "customer_return" as const, occurredAt: "2026-11-06T10:30:00+00:00", quantity: 2,
};
const supplierReturn = {
  ...sale, eventId: "supplier-return:77777777-7777-4777-8777-777777777777",
  type: "supplier_return" as const, occurredAt: "2026-11-06T11:30:00+00:00", quantity: 2,
  supplierName: "Pemasok A", referenceNumber: "Retur 88888888-8888-4888-8888-888888888888", referenceUrl: null,
};
const opnameIn = {
  ...sale, eventId: "stock-opname:99999999-9999-4999-8999-999999999999",
  type: "stock_opname_in" as const, quantity: 2, referenceNumber: "Opname aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", referenceUrl: null,
};
const opnameOut = { ...opnameIn, eventId: "stock-opname:aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa", type: "stock_opname_out" as const, quantity: 3 };
const manualReceiving = {
  eventId: "manual-receiving:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", occurredAt: "2026-11-06T12:30:00+00:00",
  type: "manual_receiving" as const, quantity: 7, unit: "Tablet", employeeName: "Owner", supplierName: "Pemasok A",
  referenceNumber: "REF-MANUAL", referenceUrl: null, batchNumber: "B-MANUAL", reason: "Penambahan darurat",
};

test("movement mapping keeps actual quantities, references, and empty-page totals", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [sale, receipt], total: 8 }), { rows: [sale, receipt], total: 8 });
  assert.deepEqual(parseStockMovementReadModel({ rows: [], total: 8 }), { rows: [], total: 8 });
});

test("movement mapping rejects invalid quantities and mismatched reference URLs", () => {
  assert.throws(() => parseStockMovementReadModel({ rows: [{ ...sale, quantity: 0 }], total: 1 }), /Invalid stock movement row/);
  assert.throws(() => parseStockMovementReadModel({ rows: [{ ...receipt, referenceUrl: sale.referenceUrl }], total: 1 }), /Invalid stock movement row/);
});

test("movement timestamp is displayed in WIB", () => {
  assert.match(formatStockMovementWib("2026-11-06T08:30:00Z"), /6 Nov 2026.*15[.:]30/);
});

test("void movement maps as a positive transaction-linked restoration", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [voided], total: 1 }).rows[0], voided);
});

test("customer return maps as a positive transaction-linked restoration", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [customerReturn], total: 1 }).rows[0], customerReturn);
});

test("supplier return maps without inventing a detail URL", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [supplierReturn], total: 1 }).rows[0], supplierReturn);
  assert.throws(() => parseStockMovementReadModel({ rows: [{ ...supplierReturn, referenceUrl: sale.referenceUrl }], total: 1 }), /Invalid stock movement row/);
});

test("stock opname maps positive and negative stored variance without a detail URL", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [opnameIn, opnameOut], total: 2 }).rows, [opnameIn, opnameOut]);
});

test("manual receiving maps immutable quantity and optional audit metadata without a link", () => {
  assert.deepEqual(parseStockMovementReadModel({ rows: [manualReceiving], total: 1 }).rows[0], manualReceiving);
  assert.throws(() => parseStockMovementReadModel({ rows: [{ ...manualReceiving, referenceUrl: sale.referenceUrl }], total: 1 }), /Invalid stock movement row/);
  assert.throws(() => parseStockMovementReadModel({ rows: [{ ...manualReceiving, batchNumber: null }], total: 1 }), /Invalid stock movement row/);
});
