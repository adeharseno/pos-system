import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDetailSections, StockMovementHistory } from "./components/product-detail-sections";
import { canViewSensitiveProductPricing } from "./product-pricing-access";
import type { AdminProductDetail } from "./data/admin-product-queries";
import type { StockMovementRow } from "@/modules/inventory/data/stock-movement-read-model-parser";
import type { StockMovementFilters } from "@/modules/inventory/stock-movement-filters";

// In-memory rendering fixture only; no application/database records are created.
const product: AdminProductDetail = {
  id: "product", sku: "SKU-1", name: "Barang", genericName: null, manufacturer: null,
  baseUnit: "tablet", requiresPrescription: true, isActive: true, category: "Obat", subcategory: "Tablet",
  defaultSupplier: null, storageLocation: null, unitCount: 1, availableStock: 7, minimumStock: 2, baseSellingPrice: 12000,
  categoryId: "category", subcategoryId: "subcategory", defaultSupplierId: null, storageLocationId: null,
  drugClassification: "prescription_required", description: null, costPrice: 7313, marginPercent: 64.09,
  taxRate: 0, isTaxable: false, unitConfirmed: true, legacySupplierText: null, units: [],
  batches: [{ id: "batch", product_id: "product", purchase_invoice_item_id: null, batch_number: "B-1", expired_date: "2030-01-01", quantity: 7, cost_price: 7123, received_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
};
const renderMovements = (rows: StockMovementRow[], total = rows.length, filters: StockMovementFilters = {}) => renderToStaticMarkup(<StockMovementHistory productId={product.id} history={{ rows, total, page: 1, limit: 10, error: false }} filters={filters}/>);

test("non-owner rendered product content excludes cost and margin, even if passed a sensitive object", () => {
  for (const role of ["kasir", "staf"] as const) {
    const html = renderToStaticMarkup(<ProductDetailSections product={product} owner={false} canViewSensitivePricing={canViewSensitiveProductPricing(role)} />);
    for (const secret of ["Harga modal", "Harga Modal", "Margin", "7.313", "7.123", "64,09", "Tambah Stok", "Tambah Satuan", "cost_price"]) assert.ok(!html.includes(secret), secret);
    assert.ok(html.includes("12.000"));
    assert.ok(html.includes("Ringkasan Stok"));
    assert.ok(html.includes("Lihat Detail Stok"));
    assert.ok(!html.includes("Rincian Batch"));
    assert.ok(!html.includes("Riwayat Pergerakan Barang"));
  }
});

test("authorized owner keeps cost, batch cost and margin; empty optional fields are omitted", () => {
  const movement = { eventId: "sale:11111111-1111-4111-8111-111111111111", occurredAt: "2026-11-06T08:30:00Z", type: "out" as const, quantity: 3, unit: "tablet", employeeName: "Kasir", supplierName: null, referenceNumber: "INV-SAMA", referenceUrl: "/transactions/22222222-2222-4222-8222-222222222222" };
  const html = renderToStaticMarkup(<ProductDetailSections product={product} owner={true} canViewSensitivePricing={canViewSensitiveProductPricing("owner_admin")} />);
  const movementHtml = renderMovements([movement, { ...movement, eventId: "sale:33333333-3333-4333-8333-333333333333", quantity: 4 }], 12);
  for (const value of ["7.313", "64,09", "Tambah Satuan", "Satuan &amp; Barcode", "Ringkasan Stok", "Lihat Detail Stok"]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("Rincian Batch"));
  assert.ok(!html.includes("Riwayat Pergerakan Barang"));
  assert.equal((movementHtml.match(/Referensi INV-SAMA/g) ?? []).length, 2, "batch allocations keep one transaction reference");
  assert.ok(movementHtml.includes("12 pergerakan"));
  assert.ok(movementHtml.includes("movementPage=2"));
  assert.ok(movementHtml.includes("text-red-700"));
  assert.ok(!html.includes("Produsen"));
});

test("void movement is labeled as stock returned", () => {
  const movement = { eventId: "void:55555555-5555-4555-8555-555555555555", occurredAt: "2026-11-06T09:30:00Z", type: "void" as const, quantity: 3, unit: "tablet", employeeName: "Kasir", supplierName: null, referenceNumber: "INV-VOID", referenceUrl: "/transactions/22222222-2222-4222-8222-222222222222" };
  const html = renderMovements([movement]);
  assert.ok(html.includes("Void · Stok Kembali"));
  assert.ok(html.includes("+3"));
});

test("customer return movement is labeled as stock returned", () => {
  const movement = { eventId: "customer-return:66666666-6666-4666-8666-666666666666", occurredAt: "2026-11-06T10:30:00Z", type: "customer_return" as const, quantity: 2, unit: "tablet", employeeName: "Kasir", supplierName: null, referenceNumber: "INV-RETURN", referenceUrl: "/transactions/22222222-2222-4222-8222-222222222222" };
  const html = renderMovements([movement]);
  assert.ok(html.includes("Retur Pelanggan · Stok Kembali"));
  assert.ok(html.includes("+2"));
});

test("supplier return movement is negative and has no invented link", () => {
  const movement = { eventId: "supplier-return:77777777-7777-4777-8777-777777777777", occurredAt: "2026-11-06T11:30:00Z", type: "supplier_return" as const, quantity: 2, unit: "tablet", employeeName: "Owner", supplierName: "Pemasok A", referenceNumber: "Retur 88888888-8888-4888-8888-888888888888", referenceUrl: null };
  const html = renderMovements([movement]);
  assert.ok(html.includes("Retur Pemasok · Barang Keluar"));
  assert.ok(html.includes("−2"));
  assert.ok(html.includes("Pemasok: Pemasok A"));
  assert.ok(!html.includes('href="null"'));
});

test("stock opname adjustments use the delta sign and shared label", () => {
  const base = { eventId: "stock-opname:99999999-9999-4999-8999-999999999999", occurredAt: "2026-11-06T09:00:00Z", type: "stock_opname_in" as const, quantity: 2, unit: "tablet", employeeName: "Owner", supplierName: null, referenceNumber: "Opname aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", referenceUrl: null };
  const rows = [base, { ...base, eventId: "stock-opname:aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa", type: "stock_opname_out" as const, quantity: 3 }];
  const html = renderMovements(rows);
  assert.equal((html.match(/Penyesuaian Stock Opname/g) ?? []).length, 2);
  assert.ok(html.includes("+2"));
  assert.ok(html.includes("−3"));
});

test("manual receiving is positive and displays immutable event metadata without a link", () => {
  const movement = { eventId: "manual-receiving:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", occurredAt: "2026-11-06T12:30:00Z", type: "manual_receiving" as const, quantity: 7, unit: "tablet", employeeName: "Owner", supplierName: "Pemasok A", referenceNumber: "REF-MANUAL", referenceUrl: null, batchNumber: "B-MANUAL", reason: "Penambahan darurat" };
  const html = renderMovements([movement]);
  for (const value of ["Tambah Stok Manual", "+7", "Batch: B-MANUAL", "Alasan: Penambahan darurat", "Pemasok: Pemasok A", "Diproses oleh Owner", "Referensi REF-MANUAL"]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('href="null"'));
});

test("movement filters render in Indonesian and remain in pagination URLs", () => {
  const movement = { eventId: "manual-receiving:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", occurredAt: "2026-11-06T12:30:00Z", type: "manual_receiving" as const, quantity: 7, unit: "tablet", employeeName: "Owner", supplierName: null, referenceNumber: null, referenceUrl: null, batchNumber: "B-MANUAL", reason: null };
  const html = renderMovements([movement], 20, { movementType: "manual_receiving", startDate: "2026-11-01", endDate: "2026-11-07" });
  for (const label of ["Jenis pergerakan", "Semua", "Penjualan", "Penerimaan Invoice", "Retur Pelanggan", "Retur Pemasok", "Stock Opname", "Tambah Stok Manual", "Tanggal mulai", "Tanggal akhir", "Tampilkan", "Reset Filter", "Export Excel"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("movementType=manual_receiving&amp;startDate=2026-11-01&amp;endDate=2026-11-07&amp;movementPage=2"));
  assert.ok(html.includes(`href="/inventory/${product.id}#riwayat-pergerakan"`));
});
