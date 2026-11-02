import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import {
  inventoryBusinessDate,
  summarizeInventoryBatches,
  type InventoryStockStatus,
} from "../inventory-rules";
import {
  type InventoryOverviewFilters,
} from "../inventory-overview-filters";

export { INVENTORY_PAGE_SIZE, parseInventoryOverviewFilters } from "../inventory-overview-filters";
export type { InventoryOverviewFilters } from "../inventory-overview-filters";
export type { InventoryStockStatus } from "../inventory-rules";

export type InventoryOverviewRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  baseUnit: string;
  availableStock: number;
  minimumStock: number;
  stockStatus: InventoryStockStatus;
  nearestExpiry: string | null;
};

export type InventoryOverviewResult = {
  rows: InventoryOverviewRow[];
  total: number;
};

type InventoryProduct = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  base_unit: string;
  minimum_stock: number;
};

type InventoryBatch = {
  product_id: string;
  quantity: number;
  expired_date: string;
};

const FETCH_PAGE_SIZE = 1000;

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw mapDatabaseError(error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) return rows;
    from += FETCH_PAGE_SIZE;
  }
}

export async function listInventoryOverview(
  filters: InventoryOverviewFilters,
): Promise<InventoryOverviewResult> {
  const admin = createAdminSupabaseClient();
  const businessDate = inventoryBusinessDate();
  const [products, categories, batches] = await Promise.all([
    fetchAll<InventoryProduct>((from, to) =>
      admin
        .from("products")
        .select("id,sku,name,category_id,base_unit,minimum_stock")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      admin.from("categories").select("id,name").order("id").range(from, to),
    ),
    fetchAll<InventoryBatch>((from, to) =>
      admin
        .from("product_batches")
        .select("product_id,quantity,expired_date")
        .gt("quantity", 0)
        .gte("expired_date", businessDate)
        .order("product_id")
        .order("expired_date")
        .order("id")
        .range(from, to),
    ),
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const batchesByProduct = new Map<string, { quantity: number; expiredDate: string }[]>();
  for (const batch of batches) {
    const productBatches = batchesByProduct.get(batch.product_id) ?? [];
    productBatches.push({ quantity: batch.quantity, expiredDate: batch.expired_date });
    batchesByProduct.set(batch.product_id, productBatches);
  }

  const filtered = products
    .map((product) => {
      const inventory = summarizeInventoryBatches(
        batchesByProduct.get(product.id) ?? [],
        product.minimum_stock,
        businessDate,
      );
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category_id ? (categoryNames.get(product.category_id) ?? "—") : "—",
        baseUnit: product.base_unit,
        availableStock: inventory.availableStock,
        minimumStock: product.minimum_stock,
        stockStatus: inventory.stockStatus,
        nearestExpiry: inventory.nearestExpiry,
      };
    })
    .filter((row) => {
      const matchesSearch =
        !filters.q ||
        `${row.name} ${row.sku}`
          .toLocaleLowerCase("id-ID")
          .includes(filters.q.toLocaleLowerCase("id-ID"));
      return matchesSearch && (filters.status === "all" || row.stockStatus === filters.status);
    });

  const start = (filters.page - 1) * filters.limit;
  return { rows: filtered.slice(start, start + filters.limit), total: filtered.length };
}
