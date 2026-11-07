import "server-only";

import {
  inventoryBusinessDate,
  type InventoryStockStatus,
} from "../inventory-rules";
import {
  type InventoryOverviewFilters,
} from "../inventory-overview-filters";
import { listStockReadModel } from "./stock-list-read-model";

export { INVENTORY_PAGE_SIZE, parseInventoryOverviewFilters } from "../inventory-overview-filters";
export type { InventoryOverviewFilters } from "../inventory-overview-filters";
export type { InventoryStockStatus } from "../inventory-rules";

export type InventoryOverviewRow = {
  id: string;
  isActive: boolean;
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

export async function listInventoryOverview(
  filters: InventoryOverviewFilters,
): Promise<InventoryOverviewResult> {
  const result = await listStockReadModel({
    businessDate: inventoryBusinessDate(), q: filters.q, stockStatus: filters.status,
    page: filters.page, limit: filters.limit,
  });
  return { rows: result.rows.map(row => ({
    id: row.id, isActive: row.isActive, sku: row.sku, name: row.name,
    category: row.category, baseUnit: row.baseUnit, availableStock: row.availableStock,
    minimumStock: row.minimumStock, stockStatus: row.stockStatus, nearestExpiry: row.nearestExpiry,
  })), total: result.total };
}
