import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAdminProduct, listAdminProducts } from "@/modules/catalog/data/admin-product-queries";
import { parseProductSearchQuery } from "@/modules/catalog/search";
import { AuthApplicationError } from "@/modules/auth/errors";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { getPurchaseInvoice } from "./invoice-repository";
import { invoiceDatabaseError, PurchaseInvoiceError } from "./invoice-errors";
import { itemSubtotalCents, parseInvoiceItem, type InvoiceProduct } from "./invoice-item-input";
import type { Database, Json } from "@/types/database.types";

export type InvoiceItem = Database["public"]["Tables"]["purchase_invoice_items"]["Row"];
export async function listInvoiceItems(invoiceId: string) {
  const result = await createAdminSupabaseClient().from("purchase_invoice_items").select("*").eq("invoice_id", invoiceId).is("deleted_at", null).order("created_at").order("id");
  if (result.error) throw mapDatabaseError(result.error);
  return result.data;
}
export async function searchInvoiceProducts(invoiceId: string, raw: string | null) {
  await getPurchaseInvoice(invoiceId);
  const q = parseProductSearchQuery(raw);
  if (!q) return [];
  const result = await listAdminProducts({ q, status: "active", prescription: "all", page: 1, limit: 20 });
  return result.rows.map(product => ({ id: product.id, name: product.name, sku: product.sku }));
}
export async function getInvoiceProduct(invoiceId: string, productId: string): Promise<InvoiceProduct> {
  await getPurchaseInvoice(invoiceId);
  const product = await getAdminProduct(productId, true);
  if (!product || !product.isActive) throw new PurchaseInvoiceError("PRODUCT_NOT_FOUND", 404, "Produk tidak ditemukan atau tidak aktif.");
  const lastBatch = await createAdminSupabaseClient().from("product_batches").select("expired_date").eq("product_id", productId).order("received_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lastBatch.error) throw mapDatabaseError(lastBatch.error);
  const units: InvoiceProduct["units"] = [...product.units].sort((a, b) => Number(b.is_base_unit) - Number(a.is_base_unit) || a.unit_name.localeCompare(b.unit_name)).map(unit => ({ id: unit.id, name: unit.unit_name, conversion: unit.conversion_to_base, sellingPrice: unit.selling_price }));
  if (!product.units.some(unit => unit.is_base_unit)) units.unshift({ id: null, name: product.baseUnit, conversion: 1, sellingPrice: null });
  return { id: product.id, sku: product.sku, name: product.name, baseUnit: product.baseUnit, costPrice: product.costPrice ?? null, taxRate: product.taxRate, previousExpiry: lastBatch.data?.expired_date ?? null, units };
}
export async function writeInvoiceItem(request: Request, invoiceId: string, employeeId: string, action: "create" | "update" | "delete", editingId?: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthApplicationError("FORBIDDEN");
  if (Number(request.headers.get("content-length") ?? 0) > 16384) throw new PosInputError("Data barang terlalu besar.");
  const body = await request.json() as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PosInputError("Data barang tidak valid.");
  const itemId = requireUuid(typeof body.id === "string" ? body.id : "", "item_id");
  const requestId = requireUuid(typeof body.request_id === "string" ? body.request_id : "", "request_id");
  if (editingId && itemId !== editingId) throw new PosInputError("Barang tidak sesuai.");
  const version = action === "create" ? null : body.version;
  if (action !== "create" && (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)) throw new PosInputError("Versi barang tidak valid.");
  const parsed = action === "delete" ? null : parseInvoiceItem(body);
  const payload = parsed ?? {};
  if (parsed && itemSubtotalCents(parsed.cost_price, parsed.quantity, parsed.tax_rate) > BigInt(99999999999999)) throw new PosInputError("Subtotal barang terlalu besar.");
  const result = await createAdminSupabaseClient().rpc("write_purchase_invoice_item", { p_invoice_id: invoiceId, p_item_id: itemId, p_request_id: requestId, p_employee_id: employeeId,
    p_expected_version: version as number | null, p_action: action, p_payload: payload as Json });
  if (result.error) invoiceDatabaseError(result.error);
  return { id: itemId };
}
