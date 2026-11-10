import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptViewModel, formatReceiptDate, RECEIPT_PHARMACY_ADDRESS, receiptStatusLabel, type ReceiptTransactionRow } from "./sales/receipt";
import { formatRupiah } from "./ui/currency";
import { requireRoleWith, type AuthDependencies } from "./auth/application/auth-policy";
import { AuthApplicationError } from "./auth/errors";
import type { EmployeeRecord } from "./auth/types";

const base: ReceiptTransactionRow = { id: "tx", invoice_number: "INV-1", created_at: "2026-08-18T06:42:00.000Z", subtotal: 10000, tax_amount: 1000, total_amount: 11000, payment_method: "cash", cash_received: 20000, cash_change: 9000, status: "completed", employees: { full_name: "Ayu" }, transaction_prescriptions: [{ prescription_category: "umum", patient_name: "Budi", bpjs_number: null, prescription_number: "R-1", prescription_origin: "dr. Ani", prescription_date: "2026-08-18" }], transaction_items: [{ quantity_in_unit: 2, unit_price: 5000, total_amount: 11000, product_name_snapshot: "Paracetamol", unit_name_snapshot: "Tablet" }] };
test("receipt header uses the pharmacy thermal-print address", () => assert.deepEqual(RECEIPT_PHARMACY_ADDRESS, ["Jln. KSR Dadi Kusmayati No. 26", "CIBINONG"]));
test("cash receipt maps authoritative financial values", () => { const model = buildReceiptViewModel(base); assert.equal(model.total, 11000); assert.equal(model.cashReceived, 20000); assert.equal(model.cashChange, 9000); });
test("receipt item maps quantity unit price and stored line total", () => assert.deepEqual(buildReceiptViewModel(base).items[0], { productName: "Paracetamol", unitName: "Tablet", quantity: 2, unitPrice: 5000, lineTotal: 11000 }));
test("receipt uses immutable transaction-time labels", () => { const renamedMaster = { name: "Paracetamol Generic", unit: "Kaplet" }; const model = buildReceiptViewModel(base); assert.deepEqual(model.items[0], { productName: "Paracetamol", unitName: "Tablet", quantity: 2, unitPrice: 5000, lineTotal: 11000 }); assert.notEqual(model.items[0].productName, renamedMaster.name); assert.notEqual(model.items[0].unitName, renamedMaster.unit); });
test("completed QRIS receipt has no cash fields and retains snapshots", () => { const model = buildReceiptViewModel({ ...base, payment_method: "qris", cash_received: null, cash_change: null }); assert.equal(model.paymentMethod, "qris"); assert.equal("cashReceived" in model, false); assert.equal(model.items[0].productName, "Paracetamol"); assert.equal(model.items[0].unitName, "Tablet"); assert.equal(receiptStatusLabel(model.status), "LUNAS"); });
test("bank transfer receipt preserves method without cash fields", () => { const model = buildReceiptViewModel({ ...base, payment_method: "bank_transfer", cash_received: null, cash_change: null }); assert.equal(model.paymentMethod, "bank_transfer"); assert.equal("cashReceived" in model, false); });
test("BPJS receipt keeps actual total with zero tender and change", () => { const model = buildReceiptViewModel({ ...base, payment_method: "bpjs", cash_received: 0, cash_change: 0, transaction_prescriptions: [{ ...base.transaction_prescriptions[0], prescription_category: "bpjs", bpjs_number: "000123" }] }); assert.equal(model.total, 11000); assert.equal(model.cashReceived, 0); assert.equal(model.cashChange, 0); assert.equal(model.paymentMethod, "bpjs"); });
test("BEBAS receipt category has no patient or prescription metadata", () => { const model = buildReceiptViewModel({ ...base, transaction_prescriptions: [{ prescription_category: "bebas", patient_name: null, bpjs_number: null, prescription_number: null, prescription_origin: null, prescription_date: null }] }); assert.equal(model.prescription.category, "bebas"); assert.equal(model.prescription.patientName, undefined); assert.equal(model.prescription.prescriptionOrigin, undefined); });
test("pending QRIS is explicitly non-final", () => assert.equal(receiptStatusLabel("pending_payment"), "MENUNGGU PEMBAYARAN"));
test("voided transaction is explicitly marked", () => assert.equal(receiptStatusLabel("voided"), "DIBATALKAN"));
test("cashier and invoice come from stored read model", () => { const model = buildReceiptViewModel(base); assert.equal(model.cashierName, "Ayu"); assert.equal(model.invoiceNumber, "INV-1"); });
test("Asia Jakarta receipt date formatting is stable", () => { const value = formatReceiptDate(base.created_at); assert.match(value, /18/); assert.match(value, /13[.:]42/); });
test("receipt reuses shared Rupiah formatter", () => assert.equal(formatRupiah(buildReceiptViewModel(base).total), "Rp 11.000"));
test("receipt view model exposes no batch allocation internals", () => assert.equal(JSON.stringify(buildReceiptViewModel(base)).includes("batch"), false));
const user = { id: "auth" }; const employee = (role: EmployeeRecord["role"]): EmployeeRecord => ({ employeeId: "employee", name: "User", role, isActive: true }); const deps = (role: EmployeeRecord["role"]): AuthDependencies => ({ getUser: async () => user, findEmployee: async () => employee(role), signOut: async () => { } });
test("cashier may access receipt policy", async () => assert.equal((await requireRoleWith(["owner_admin", "kasir"], deps("kasir"))).role, "kasir"));
test("owner admin may access receipt policy", async () => assert.equal((await requireRoleWith(["owner_admin", "kasir"], deps("owner_admin"))).role, "owner_admin"));
test("staf may not access receipt policy", async () => assert.rejects(() => requireRoleWith(["owner_admin", "kasir"], deps("staf")), (error: unknown) => error instanceof AuthApplicationError && error.code === "FORBIDDEN"));
test("receipt data reload is independent of cart state", () => assert.equal(buildReceiptViewModel({ ...base }).transactionId, "tx"));
test("UMUM receipt retains prescription metadata and hides BPJS data", () => { const model = buildReceiptViewModel(base); assert.equal(model.prescription.category, "umum"); assert.equal(model.prescription.patientName, "Budi"); assert.equal(model.prescription.bpjsNumber, undefined); });
test("BPJS receipt retains BPJS metadata for reprint", () => { const model = buildReceiptViewModel({ ...base, transaction_prescriptions: [{ ...base.transaction_prescriptions[0], prescription_category: "bpjs", bpjs_number: "000123" }] }); assert.equal(model.prescription.category, "bpjs"); assert.equal(model.prescription.bpjsNumber, "000123"); });
test("historical transaction without metadata defaults to UMUM", () => assert.equal(buildReceiptViewModel({ ...base, transaction_prescriptions: [] }).prescription.category, "umum"));
test("receipt strips (Produk Tambahan) suffix cleanly from product names", () => {
  const rowWithSuffix: ReceiptTransactionRow = {
    ...base,
    transaction_items: [
      { quantity_in_unit: 1, unit_price: 10000, total_amount: 10000, product_name_snapshot: "BPJS ASETOSAL 100 TAB (Produk Tambahan)", unit_name_snapshot: "Tablet" },
      { quantity_in_unit: 2, unit_price: 5000, total_amount: 10000, product_name_snapshot: "AMOXICILLIN 500 (produk tambahan)", unit_name_snapshot: "Kapsul" },
      { quantity_in_unit: 1, unit_price: 8000, total_amount: 8000, product_name_snapshot: "PARACETAMOL 500MG", unit_name_snapshot: "Strip" }
    ]
  };
  const model = buildReceiptViewModel(rowWithSuffix);
  assert.equal(model.items[0].productName, "BPJS ASETOSAL 100 TAB");
  assert.equal(model.items[1].productName, "AMOXICILLIN 500");
  assert.equal(model.items[2].productName, "PARACETAMOL 500MG");
});


