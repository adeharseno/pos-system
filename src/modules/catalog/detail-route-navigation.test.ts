import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("master and inventory lists link to their own detail routes", () => {
  const products = source("../../app/(protected)/products/page.tsx");
  const inventory = source("../../app/(protected)/inventory/page.tsx");
  assert.match(products, /href=\{`\/products\/\$\{row\.id\}`\}/);
  assert.doesNotMatch(products, /href=\{`\/inventory\/\$\{row\.id\}`\}/);
  assert.match(inventory, /href=\{`\/inventory\/\$\{row\.id\}`\}/);
  assert.doesNotMatch(inventory, /href=\{`\/products\/\$\{row\.id\}`\}/);
});

test("movement query lives only on inventory detail while master links to it", () => {
  const masterPage = source("../../app/(protected)/products/[id]/page.tsx");
  const stockPage = source("../../app/(protected)/inventory/[productId]/page.tsx");
  const sections = source("./components/product-detail-sections.tsx");
  const receiving = source("../inventory/components/receive-stock-form.tsx");
  assert.doesNotMatch(masterPage, /listProductStockMovements/);
  assert.match(stockPage, /listProductStockMovements/);
  assert.match(stockPage, /Lihat Informasi Barang/);
  assert.match(sections, /Lihat Detail Stok/);
  assert.match(receiving, /router\.push\(`\/inventory\/\$\{productId\}\?stockAdded=1`\)/);
});
