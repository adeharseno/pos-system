import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { inventoryBusinessDate, summarizeInventoryBatches, type InventoryStockStatus } from "../inventory-rules";

export type { InventoryStockStatus } from "../inventory-rules";
export type InventoryOverviewFilters = { q: string; status: "all" | InventoryStockStatus };
export type InventoryOverviewRow = { id: string; sku: string; name: string; category: string; baseUnit: string; availableStock: number; minimumStock: number; stockStatus: InventoryStockStatus; nearestExpiry: string | null };

export function parseInventoryOverviewFilters(input: Record<string, string | undefined>): InventoryOverviewFilters {
  const raw = (input.q ?? "").trim().slice(0, 80);
  const q = /^[-.\p{L}\p{N}_ ]*$/u.test(raw) ? raw : "";
  const status = input.status === "out" || input.status === "low" || input.status === "safe" ? input.status : "all";
  return { q, status };
}

export async function listInventoryOverview(filters: InventoryOverviewFilters): Promise<InventoryOverviewRow[]> {
  const admin = createAdminSupabaseClient();
  const [productsResult, categoriesResult, batchesResult] = await Promise.all([
    admin.from("products").select("id,sku,name,category_id,base_unit,minimum_stock").order("name").order("id"),
    admin.from("categories").select("id,name"),
    admin.from("product_batches").select("product_id,quantity,expired_date").gt("quantity", 0).gte("expired_date", inventoryBusinessDate()),
  ]);
  if (productsResult.error) throw mapDatabaseError(productsResult.error);
  if (categoriesResult.error) throw mapDatabaseError(categoriesResult.error);
  if (batchesResult.error) throw mapDatabaseError(batchesResult.error);

  const categoryNames = new Map((categoriesResult.data ?? []).map((category) => [category.id, category.name]));
  const batchesByProduct = new Map<string, { quantity: number; expiredDate: string }[]>();
  for (const batch of batchesResult.data ?? []) {
    const productBatches = batchesByProduct.get(batch.product_id) ?? [];
    productBatches.push({ quantity: batch.quantity, expiredDate: batch.expired_date });
    batchesByProduct.set(batch.product_id, productBatches);
  }

  return (productsResult.data ?? []).map((product) => {
    const inventory = summarizeInventoryBatches(batchesByProduct.get(product.id) ?? [], product.minimum_stock);
    return { id: product.id, sku: product.sku, name: product.name, category: categoryNames.get(product.category_id) ?? "—", baseUnit: product.base_unit, availableStock: inventory.availableStock, minimumStock: product.minimum_stock, stockStatus: inventory.stockStatus, nearestExpiry: inventory.nearestExpiry };
  }).filter((row) => {
    const matchesSearch = !filters.q || `${row.name} ${row.sku}`.toLocaleLowerCase("id-ID").includes(filters.q.toLocaleLowerCase("id-ID"));
    return matchesSearch && (filters.status === "all" || row.stockStatus === filters.status);
  });
}
