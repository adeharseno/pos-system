import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDetailSections } from "./components/product-detail-sections";
import { canViewSensitiveProductPricing } from "./product-pricing-access";
import type { AdminProductDetail } from "./data/admin-product-queries";

// In-memory rendering fixture only; no application/database records are created.
const product: AdminProductDetail = {
  id: "product", sku: "SKU-1", name: "Barang", genericName: null, manufacturer: null,
  baseUnit: "tablet", requiresPrescription: true, isActive: true, category: "Obat", subcategory: "Tablet",
  defaultSupplier: null, storageLocation: null, unitCount: 1, availableStock: 7, baseSellingPrice: 12000,
  categoryId: "category", subcategoryId: "subcategory", defaultSupplierId: null, storageLocationId: null,
  drugClassification: "prescription_required", description: null, costPrice: 7313, marginPercent: 64.09,
  taxRate: 0, isTaxable: false, minimumStock: 2, units: [],
  batches: [{ id: "batch", product_id: "product", batch_number: "B-1", expired_date: "2030-01-01", quantity: 7, cost_price: 7123, received_date: "2026-01-01", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
};

test("non-owner rendered product content excludes cost and margin, even if passed a sensitive object", () => {
  for (const role of ["kasir", "staf"] as const) {
    const html = renderToStaticMarkup(<ProductDetailSections product={product} owner={false} canViewSensitivePricing={canViewSensitiveProductPricing(role)} />);
    for (const secret of ["Harga modal", "Harga Modal", "Margin", "7.313", "7.123", "64,09", "Tambah Satuan", "cost_price"]) assert.ok(!html.includes(secret), secret);
    assert.ok(html.includes("12.000"));
    assert.ok(html.includes("Stok Tersedia"));
  }
});

test("authorized owner keeps cost, batch cost and margin; empty optional fields are omitted", () => {
  const html = renderToStaticMarkup(<ProductDetailSections product={product} owner={true} canViewSensitivePricing={canViewSensitiveProductPricing("owner_admin")} />);
  for (const value of ["7.313", "7.123", "64,09", "Tambah Satuan", "Satuan &amp; Barcode"]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("Informasi Tambahan"));
  assert.ok(!html.includes("Produsen"));
});
