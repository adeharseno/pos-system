import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProductImportPlan,
  buildProductImportPlan,
  mapLegacyProductRows,
  ProductImportBlockedError,
  type ExistingProduct,
  type ProductImportLookups,
  type ProductImportMapping,
  type ProductImportStore,
  type ProductImportWrite,
} from "./product-import";

const header = ["No.", "Nama", "Harga", "SKU", "Satuan Dasar", "Sub kategori", "Klasifikasi", "Supplier"];

type RowInput = {
  no?: number | string;
  name: string;
  harga?: string;
  sku?: string;
  unit?: string;
  sub?: string;
  kategori?: string;
  supplier?: string;
};

function sheet(rows: RowInput[]) {
  return [
    header,
    ...rows.map((row, index) => [
      String(row.no ?? index + 1),
      row.name,
      row.harga ?? "1000",
      row.sku ?? "",
      row.unit ?? "TAB",
      row.sub ?? "",
      row.kategori ?? "",
      row.supplier ?? "",
    ]),
  ];
}

const defaultMapping: ProductImportMapping = {
  subkategori: {},
  kategori: {
    "OBAT BEBAS": "OBAT BEBAS",
    "OBAT RESEP": "OBAT RESEP",
    "RACIK": "RACIK",
    "PSIKOTROPIKA": "PSIKOTROPIKA",
  },
};

const defaultCategories = [
  { id: "cat-obat-bebas", name: "OBAT BEBAS" },
  { id: "cat-obat-resep", name: "OBAT RESEP" },
  { id: "cat-racik", name: "RACIK" },
  { id: "cat-psikotropika", name: "PSIKOTROPIKA" },
];

const defaultSubcategories = [
  { id: "sub-tablet", name: "Tablet" },
  { id: "sub-bebas", name: "Bebas" },
];

const defaultSuppliers = [
  { id: "sup-a", name: "PT A", is_active: true },
  { id: "sup-b", name: "PT B", is_active: true },
];

function lookups(overrides: Partial<ProductImportLookups> = {}): ProductImportLookups {
  return {
    categories: defaultCategories,
    subcategories: defaultSubcategories,
    suppliers: defaultSuppliers,
    products: [],
    ...overrides,
  };
}

type StoredProduct = ExistingProduct & {
  base_unit: string;
  drug_classification: string;
};

type StoredUnit = {
  product_id: string;
  unit_name: string;
  conversion_to_base: number;
  selling_price: number;
  is_base_unit: boolean;
};

type MemoryStore = ProductImportStore & {
  products: Map<string, StoredProduct>;
  units: StoredUnit[];
  applyCalls: () => number;
};

function memoryStore(
  options: {
    products?: ExistingProduct[];
    categories?: ProductImportLookups["categories"];
    subcategories?: ProductImportLookups["subcategories"];
    suppliers?: ProductImportLookups["suppliers"];
  } = {},
): MemoryStore {
  const state = {
    products: new Map<string, StoredProduct>(),
    units: [] as StoredUnit[],
    applyCalls: 0,
    nextId: 1,
  };
  for (const product of options.products ?? []) {
    state.products.set(product.id, { ...product, base_unit: "TAB", drug_classification: "otc" });
  }

  return {
    products: state.products,
    units: state.units,
    applyCalls: () => state.applyCalls,
    async loadLookups() {
      return {
        categories: options.categories ?? defaultCategories,
        subcategories: options.subcategories ?? defaultSubcategories,
        suppliers: options.suppliers ?? defaultSuppliers,
        products: [...state.products.values()].map((product) => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          category_id: product.category_id,
          subcategory_id: product.subcategory_id,
          default_supplier_id: product.default_supplier_id,
        })),
      };
    },
    async apply(writes: ProductImportWrite[]) {
      state.applyCalls += 1;
      for (const write of writes) {
        if (write.kind === "insert") {
          const id = `product-${state.nextId++}`;
          state.products.set(id, {
            id,
            sku: write.value.sku,
            name: write.value.name,
            category_id: write.value.category_id,
            subcategory_id: write.value.subcategory_id,
            default_supplier_id: write.value.default_supplier_id,
            base_unit: write.value.base_unit,
            drug_classification: write.value.drug_classification,
          });
          if (write.value.selling_price !== null) {
            state.units.push({
              product_id: id,
              unit_name: write.value.base_unit,
              conversion_to_base: 1,
              selling_price: write.value.selling_price,
              is_base_unit: true,
            });
          }
        } else {
          const product = state.products.get(write.value.id);
          if (!product) throw new Error(`missing product ${write.value.id}`);
          product.category_id = write.value.category_id;
          product.subcategory_id = write.value.subcategory_id;
          product.default_supplier_id = write.value.default_supplier_id;
        }
      }
    },
  };
}

test("SKU stays text with leading zeros and comma prices are parsed", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      {
        name: "Produk A",
        harga: "16,500",
        sku: "00200710",
        unit: "TAB",
        sub: "Tablet",
        kategori: "OBAT BEBAS",
        supplier: "PT A",
      },
    ]),
  );

  assert.equal(parsed.read, 1);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].sku, "00200710");
  assert.equal(parsed.records[0].price, 16500);
  assert.equal(parsed.records[0].baseUnit, "TAB");
  assert.equal(parsed.records[0].category, "OBAT BEBAS");
});

test("empty names are skipped and later duplicate names are reported", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "", sku: "EMPTY-1" },
      { name: "Produk A", sku: "SKU-1", sub: "Tablet", kategori: "OBAT BEBAS", supplier: "PT A" },
      { name: " produk a ", sku: "SKU-2", sub: "Bebas", kategori: "OBAT RESEP", supplier: "PT B" },
    ]),
  );

  assert.equal(parsed.read, 3);
  assert.equal(parsed.skippedEmpty, 1);
  assert.equal(parsed.skippedDuplicate, 1);
  assert.equal(parsed.records.length, 1);

  const plan = buildProductImportPlan(parsed, defaultMapping, lookups());
  assert.equal(plan.summary.inserted, 1);
  assert.ok(plan.issues.some((issue) => issue.issue === "empty name"));
  assert.ok(plan.issues.some((issue) => issue.issue.startsWith("duplicate name (first at row 2)")));
});

test("empty units are inferred from the product name", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "OBAT TABLET", sku: "I-1", unit: "" },
      { name: "SIRUP HERBAL", sku: "I-2", unit: "" },
      { name: "SALEP", sku: "I-3", unit: "" },
    ]),
  );

  const plan = buildProductImportPlan(parsed, defaultMapping, lookups());
  assert.equal(plan.summary.inferredUnits, 3);
  assert.deepEqual(plan.summary.inferredUnitCounts, { TAB: 1, BTL: 1, PCS: 1 });
  const inserted = plan.writes.flatMap((write) => (write.kind === "insert" ? [write.value] : []));
  assert.deepEqual(inserted.map((value) => value.base_unit), ["TAB", "BTL", "PCS"]);
});

test("generated SKUs continue after the highest N- number and never collide", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "New A", sku: "" },
      { name: "New B", sku: "N-00005" },
      { name: "New C", sku: "" },
    ]),
  );
  const plan = buildProductImportPlan(
    parsed,
    defaultMapping,
    lookups({
      products: [
        {
          id: "existing",
          sku: "N-00003",
          name: "Existing",
          category_id: null,
          subcategory_id: null,
          default_supplier_id: null,
        },
      ],
    }),
  );

  const skus = plan.writes.flatMap((write) => (write.kind === "insert" ? [write.value.sku] : []));
  assert.deepEqual(skus, ["N-00006", "N-00005", "N-00007"]);
  assert.equal(plan.summary.generatedSkus, 2);
  assert.equal(new Set(skus).size, skus.length);
});

test("zero price creates the product without a selling price or unit row", async () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Produk Gratis", harga: "0", sku: "ZERO-1", unit: "TAB" }]),
  );
  const plan = buildProductImportPlan(parsed, defaultMapping, lookups());

  assert.equal(plan.summary.zeroPrice, 1);
  const insert = plan.writes[0];
  assert.equal(insert.kind, "insert");
  if (insert.kind === "insert") assert.equal(insert.value.selling_price, null);

  const store = memoryStore();
  await applyProductImportPlan(plan, store);
  assert.equal(store.products.size, 1);
  assert.equal(store.units.length, 0);
});

test("an ambiguous supplier becomes NULL and is reported", () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Produk A", sku: "SKU-1", supplier: "PT SANDANA" }]),
  );
  const plan = buildProductImportPlan(
    parsed,
    defaultMapping,
    lookups({
      suppliers: [
        { id: "sandana-1", name: "PT SANDANA", is_active: true },
        { id: "sandana-2", name: "PT SANDANA", is_active: true },
      ],
    }),
  );

  assert.equal(plan.summary.supplierAmbiguous, 1);
  assert.equal(plan.summary.supplierNone, 0);
  const insert = plan.writes[0];
  assert.equal(insert.kind, "insert");
  if (insert.kind === "insert") assert.equal(insert.value.default_supplier_id, null);
  assert.ok(plan.issues.some((issue) => issue.issue.startsWith("supplier ambiguous: PT SANDANA")));
});

test("multiple supplier matches prefer the only active row", () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Produk A", sku: "SKU-1", supplier: "GUDANG" }]),
  );
  const plan = buildProductImportPlan(
    parsed,
    defaultMapping,
    lookups({
      suppliers: [
        { id: "gudang-active", name: "GUDANG", is_active: true },
        { id: "gudang-inactive", name: "GUDANG", is_active: false },
      ],
    }),
  );

  assert.equal(plan.summary.supplierAmbiguous, 0);
  const insert = plan.writes[0];
  assert.equal(insert.kind, "insert");
  if (insert.kind === "insert") assert.equal(insert.value.default_supplier_id, "gudang-active");
});

test("unmapped category is reported and blocks a real run without the flag", async () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Racikan", sku: "RACIK-1", sub: "Tablet", kategori: "KATEGORI ASING" }]),
  );
  const plan = buildProductImportPlan(parsed, defaultMapping, lookups());

  assert.deepEqual(plan.summary.unmappedCategories, [{ value: "KATEGORI ASING", count: 1 }]);
  assert.deepEqual(plan.summary.unmappedSubcategories, []);
  assert.equal(plan.summary.inserted, 1);
  const insert = plan.writes[0];
  assert.equal(insert.kind, "insert");
  if (insert.kind === "insert") assert.equal(insert.value.drug_classification, "otc");

  const store = memoryStore();
  await assert.rejects(
    () => applyProductImportPlan(plan, store),
    (error: unknown) => error instanceof ProductImportBlockedError,
  );
  assert.equal(store.applyCalls(), 0);

  await applyProductImportPlan(plan, store, { allowUnmapped: true });
  assert.equal(store.applyCalls(), 1);
});

test("Klasifikasi becomes a category and drug classification stays at the default", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "Bebas A", sku: "SKU-1", sub: "Tablet", kategori: "obat bebas" },
      { name: "Psikotropika A", sku: "SKU-2", sub: "Tablet", kategori: "PSIKOTROPIKA" },
      { name: "Tanpa kategori", sku: "SKU-3" },
    ]),
  );
  const plan = buildProductImportPlan(parsed, defaultMapping, lookups());

  const inserted = plan.writes.flatMap((write) => (write.kind === "insert" ? [write.value] : []));
  assert.deepEqual(
    inserted.map((value) => [value.category_id, value.drug_classification]),
    [
      ["cat-obat-bebas", "otc"],
      ["cat-psikotropika", "otc"],
      [null, "otc"],
    ],
  );
  assert.deepEqual(plan.summary.drugClassificationCounts, { otc: 3 });
});

test("existing products fill NULL category and lookup fields", () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "Produk A", sku: "SKU-1", sub: "Tablet", kategori: "OBAT BEBAS", supplier: "PT A" },
    ]),
  );
  const plan = buildProductImportPlan(
    parsed,
    defaultMapping,
    lookups({
      products: [
        {
          id: "product-1",
          sku: "SKU-1",
          name: "Produk A",
          category_id: null,
          subcategory_id: null,
          default_supplier_id: null,
        },
      ],
    }),
  );

  assert.equal(plan.summary.inserted, 0);
  assert.equal(plan.summary.updated, 1);
  const update = plan.writes[0];
  assert.equal(update.kind, "update");
  if (update.kind === "update") {
    assert.equal(update.value.category_id, "cat-obat-bebas");
    assert.equal(update.value.subcategory_id, "sub-tablet");
    assert.equal(update.value.default_supplier_id, "sup-a");
  }
});

test("a second run inserts zero rows and preserves manual edits", async () => {
  const parsed = mapLegacyProductRows(
    sheet([
      { name: "Produk A", harga: "10,000", sku: "SKU-1", sub: "Tablet", kategori: "OBAT BEBAS", supplier: "PT A" },
    ]),
  );
  const store = memoryStore();
  const first = buildProductImportPlan(parsed, defaultMapping, await store.loadLookups());
  await applyProductImportPlan(first, store);
  assert.equal(first.summary.inserted, 1);
  assert.equal(store.units.length, 1);

  const product = [...store.products.values()][0];
  product.name = "EDITED NAME";
  store.units[0].selling_price = 999;

  const second = buildProductImportPlan(parsed, defaultMapping, await store.loadLookups());
  assert.equal(second.summary.inserted, 0);
  assert.equal(second.summary.unchanged, 1);
  await applyProductImportPlan(second, store);

  assert.equal(store.products.size, 1);
  assert.equal(product.name, "EDITED NAME");
  assert.equal(store.units.length, 1);
  assert.equal(store.units[0].selling_price, 999);
});

test("products with a generated SKU match by name on a second run", async () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Tanpa SKU", harga: "5,000", sku: "", unit: "", sub: "", kategori: "", supplier: "" }]),
  );
  const store = memoryStore();
  const first = buildProductImportPlan(parsed, defaultMapping, await store.loadLookups());
  await applyProductImportPlan(first, store);
  assert.equal(first.summary.inserted, 1);
  assert.equal(first.summary.generatedSkus, 1);
  assert.equal(first.summary.inferredUnits, 1);

  const second = buildProductImportPlan(parsed, defaultMapping, await store.loadLookups());
  assert.equal(second.summary.inserted, 0);
  assert.equal(second.summary.unchanged, 1);
  assert.equal(second.summary.generatedSkus, 0);
  assert.equal(second.summary.inferredUnits, 0);
  await applyProductImportPlan(second, store);
  assert.equal(store.products.size, 1);
});

test("mapping JSON overrides default category and subcategory lookup", () => {
  const parsed = mapLegacyProductRows(
    sheet([{ name: "Produk A", sku: "SKU-1", sub: "TAB", kategori: "KATEGORI LAMA" }]),
  );
  const plan = buildProductImportPlan(
    parsed,
    {
      subkategori: { TAB: "Tablet" },
      kategori: { "KATEGORI LAMA": "OBAT BEBAS" },
    },
    lookups(),
  );

  const insert = plan.writes[0];
  assert.equal(insert.kind, "insert");
  if (insert.kind === "insert") {
    assert.equal(insert.value.category_id, "cat-obat-bebas");
    assert.equal(insert.value.subcategory_id, "sub-tablet");
    assert.equal(insert.value.drug_classification, "otc");
  }
  assert.deepEqual(plan.summary.unmappedCategories, []);
  assert.deepEqual(plan.summary.unmappedSubcategories, []);
  assert.deepEqual(plan.summary.drugClassificationCounts, { otc: 1 });
});
