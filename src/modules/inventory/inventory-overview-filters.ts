import type { InventoryStockStatus } from "./inventory-rules";

export const INVENTORY_PAGE_SIZE = 10;

export type InventoryOverviewFilters = {
  q: string;
  status: "all" | InventoryStockStatus;
  page: number;
  limit: number;
};

export function parseInventoryOverviewFilters(
  input: Record<string, string | undefined>,
): InventoryOverviewFilters {
  const raw = (input.q ?? "").trim().slice(0, 80);
  const q = /^[-.\p{L}\p{N}_ ]*$/u.test(raw) ? raw : "";
  const status =
    input.status === "out" || input.status === "low" || input.status === "safe"
      ? input.status
      : "all";
  const page =
    typeof input.page === "string" && /^\d+$/.test(input.page)
      ? Math.max(1, Math.min(Number(input.page), 10000))
      : 1;
  return { q, status, page, limit: INVENTORY_PAGE_SIZE };
}
