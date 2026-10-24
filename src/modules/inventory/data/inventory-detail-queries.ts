import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { inventoryBusinessDate, inventoryExpiryStatus, summarizeInventoryBatches, type InventoryExpiryStatus, type InventoryStockStatus } from "../inventory-rules";

export type InventoryBatchDetail = { id: string; batchNumber: string; quantity: number; receivedDate: string; expiredDate: string; expiryStatus: InventoryExpiryStatus; costPrice?: number };
export type InventoryProductDetail = { id: string; sku: string; name: string; category: string; subcategory: string; baseUnit: string; availableStock: number; minimumStock: number; stockStatus: InventoryStockStatus; nearestExpiry: string | null; batches: InventoryBatchDetail[] };
type BatchRead = { id: string; batch_number: string; quantity: number; received_date: string; expired_date: string; cost_price?: number };

function buildDetail(product: { id: string; sku: string; name: string; base_unit: string; minimum_stock: number }, category: string, subcategory: string, rows: BatchRead[], includeSensitivePricing: boolean): InventoryProductDetail {
  const businessDate = inventoryBusinessDate();
  const summary = summarizeInventoryBatches(rows.map((batch) => ({ quantity: batch.quantity, expiredDate: batch.expired_date })), product.minimum_stock, businessDate);
  const batches = rows.map((batch) => {
    const detail: InventoryBatchDetail = { id: batch.id, batchNumber: batch.batch_number, quantity: batch.quantity, receivedDate: batch.received_date, expiredDate: batch.expired_date, expiryStatus: inventoryExpiryStatus(batch.expired_date, businessDate) };
    if (includeSensitivePricing && batch.cost_price !== undefined) detail.costPrice = batch.cost_price;
    return detail;
  });
  return { id: product.id, sku: product.sku, name: product.name, category, subcategory, baseUnit: product.base_unit, availableStock: summary.availableStock, minimumStock: product.minimum_stock, stockStatus: summary.stockStatus, nearestExpiry: summary.nearestExpiry, batches };
}

export async function getInventoryProductDetail(productId: string, includeSensitivePricing: boolean): Promise<InventoryProductDetail | null> {
  const admin = createAdminSupabaseClient();
  const productResult = await admin.from("products").select("id,sku,name,category_id,subcategory_id,base_unit,minimum_stock").eq("id", productId).maybeSingle();
  if (productResult.error) throw mapDatabaseError(productResult.error);
  const product = productResult.data;
  if (!product) return null;
  const [categoriesResult, subcategoriesResult] = await Promise.all([
    admin.from("categories").select("name").eq("id", product.category_id).maybeSingle(),
    admin.from("subcategories").select("name").eq("id", product.subcategory_id).maybeSingle(),
  ]);
  if (categoriesResult.error) throw mapDatabaseError(categoriesResult.error);
  if (subcategoriesResult.error) throw mapDatabaseError(subcategoriesResult.error);
  const category = categoriesResult.data?.name ?? "—";
  const subcategory = subcategoriesResult.data?.name ?? "—";
  if (includeSensitivePricing) {
    const batchesResult = await admin.from("product_batches").select("id,batch_number,quantity,cost_price,received_date,expired_date").eq("product_id", product.id).order("expired_date").order("created_at").order("id");
    if (batchesResult.error) throw mapDatabaseError(batchesResult.error);
    return buildDetail(product, category, subcategory, batchesResult.data ?? [], true);
  }
  const batchesResult = await admin.from("product_batches").select("id,batch_number,quantity,received_date,expired_date").eq("product_id", product.id).order("expired_date").order("created_at").order("id");
  if (batchesResult.error) throw mapDatabaseError(batchesResult.error);
  return buildDetail(product, category, subcategory, batchesResult.data ?? [], false);
}
