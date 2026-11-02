export const PRODUCT_IMPORT_MINIMUM_STOCK = 5;
export const DEFAULT_DRUG_CLASSIFICATION = "otc" as const;
export const DRUG_CLASSIFICATIONS = ["otc", "otc_limited", "prescription_required"] as const;

export type DrugClassification = (typeof DRUG_CLASSIFICATIONS)[number];

// The current enum has no psychotropic-specific value. If one is added later,
// point this constant at it and PSIKOTROPIKA products will use it.
const PSYCHOTROPIC_CLASSIFICATION: DrugClassification | null = null;

export type LegacyProductRecord = {
  rowNumber: number;
  name: string;
  price: number | null;
  sku: string | null;
  baseUnit: string;
  unitInferred: boolean;
  category: string | null;
  subcategory: string | null;
  supplier: string | null;
};

export type ProductImportIssue = {
  rowNumber: number;
  name: string;
  issue: string;
};

export type ParsedProductRows = {
  records: LegacyProductRecord[];
  read: number;
  skippedEmpty: number;
  skippedDuplicate: number;
  issues: ProductImportIssue[];
};

export type ProductImportMapping = {
  subkategori: Record<string, string>;
  kategori: Record<string, string>;
};

export type ExistingProduct = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  default_supplier_id: string | null;
};

export type ProductImportLookups = {
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string; is_active: boolean }>;
  products: ExistingProduct[];
};

export type ProductImportInsert = {
  rowNumber: number;
  name: string;
  sku: string;
  base_unit: string;
  category_id: string | null;
  subcategory_id: string | null;
  drug_classification: DrugClassification;
  default_supplier_id: string | null;
  minimum_stock: number;
  selling_price: number | null;
};

export type ProductImportUpdate = {
  rowNumber: number;
  name: string;
  id: string;
  category_id: string | null;
  subcategory_id: string | null;
  default_supplier_id: string | null;
};

export type ProductImportWrite =
  | { kind: "insert"; value: ProductImportInsert }
  | { kind: "update"; value: ProductImportUpdate };

export type UnmappedValue = {
  value: string;
  count: number;
};

export type ProductImportSummary = {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedEmpty: number;
  skippedDuplicate: number;
  unmappedCategories: UnmappedValue[];
  unmappedSubcategories: UnmappedValue[];
  drugClassificationCounts: Record<string, number>;
  generatedSkus: number;
  inferredUnits: number;
  inferredUnitCounts: Record<string, number>;
  zeroPrice: number;
  supplierNone: number;
  supplierAmbiguous: number;
};

export type ProductImportPlan = {
  writes: ProductImportWrite[];
  issues: ProductImportIssue[];
  summary: ProductImportSummary;
};

export type ProductImportStore = {
  loadLookups: () => Promise<ProductImportLookups>;
  /** Must apply every write in one transaction and roll back on the first failure. */
  apply: (writes: ProductImportWrite[]) => Promise<void>;
};

const LEGACY_COLUMNS = [
  "No.",
  "Nama",
  "Harga",
  "SKU",
  "Satuan Dasar",
  "Sub kategori",
  "Klasifikasi",
  "Supplier",
] as const;

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function rowNumberOf(value: unknown, offset: number) {
  const parsed = Number(text(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : offset + 2;
}

/**
 * Legacy prices use comma thousands (16,500) and never decimals, but this also
 * accepts dot thousands and a decimal separator without losing precision.
 */
export function parseLegacyPrice(value: unknown, rowNumber: number): number | null {
  const raw = text(value);
  if (!raw) return null;
  let normalized = raw.replace(/\s/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Baris ${rowNumber}: Harga "${raw}" tidak valid.`);
  }
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Baris ${rowNumber}: Harga "${raw}" tidak valid.`);
  }
  return price;
}

export function inferBaseUnit(name: string): string {
  const tokens = name.toUpperCase().split(/[^A-Z0-9]+/);
  if (tokens.includes("TAB") || tokens.includes("TABLET")) return "TAB";
  if (tokens.includes("CAP") || tokens.includes("CAPS") || tokens.includes("KAPSUL")) return "CAP";
  if (tokens.includes("SYR") || tokens.includes("SIRUP") || tokens.includes("SYRUP")) return "BTL";
  return "PCS";
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Mapping ${label} harus berupa objek.`);
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error(`Mapping ${label}.${key} harus berupa teks.`);
    }
    const trimmedKey = key.trim();
    if (!trimmedKey) throw new Error(`Mapping ${label} memiliki kunci kosong.`);
    result[trimmedKey] = entry.trim();
  }
  return result;
}

export function parseProductImportMapping(value: unknown): ProductImportMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Mapping import produk harus berupa objek.");
  }
  const record = value as Record<string, unknown>;
  return {
    subkategori: stringRecord(record.subkategori, "subkategori"),
    kategori: stringRecord(record.kategori, "kategori"),
  };
}

/**
 * Maps the Produk sheet, skipping empty names and later duplicate names
 * (case-insensitive after trimming). SKU stays text so leading zeros survive.
 */
export function mapLegacyProductRows(rows: readonly (readonly unknown[])[]): ParsedProductRows {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return { records: [], read: 0, skippedEmpty: 0, skippedDuplicate: 0, issues: [] };
  }
  const headers = headerRow.map(text);
  for (const required of LEGACY_COLUMNS) {
    if (!headers.includes(required)) {
      throw new Error(`Kolom ${required} tidak ditemukan pada sheet Produk.`);
    }
  }
  const columnIndex = new Map(headers.map((header, index) => [header, index]));
  const cell = (row: readonly unknown[], column: (typeof LEGACY_COLUMNS)[number]) =>
    text(row[columnIndex.get(column) ?? -1]);

  const filtered = dataRows.filter((row) => row.some((value) => text(value) !== ""));
  const records: LegacyProductRecord[] = [];
  const issues: ProductImportIssue[] = [];
  const firstRowByName = new Map<string, { rowNumber: number; name: string }>();
  let skippedEmpty = 0;
  let skippedDuplicate = 0;

  for (const [offset, row] of filtered.entries()) {
    const rowNumber = rowNumberOf(cell(row, "No."), offset);
    const name = cell(row, "Nama");
    if (!name) {
      skippedEmpty += 1;
      issues.push({ rowNumber, name: "", issue: "empty name" });
      continue;
    }
    const nameKey = normalizeKey(name);
    const first = firstRowByName.get(nameKey);
    if (first) {
      skippedDuplicate += 1;
      issues.push({
        rowNumber,
        name,
        issue: `duplicate name (first at row ${first.rowNumber})`,
      });
      continue;
    }
    firstRowByName.set(nameKey, { rowNumber, name });

    const sourceUnit = cell(row, "Satuan Dasar");
    records.push({
      rowNumber,
      name,
      price: parseLegacyPrice(cell(row, "Harga"), rowNumber),
      sku: cell(row, "SKU") || null,
      baseUnit: sourceUnit || inferBaseUnit(name),
      unitInferred: !sourceUnit,
      category: cell(row, "Klasifikasi") || null,
      subcategory: cell(row, "Sub kategori") || null,
      supplier: cell(row, "Supplier") || null,
    });
  }

  return { records, read: filtered.length, skippedEmpty, skippedDuplicate, issues };
}

function addUnmapped(map: Map<string, UnmappedValue>, value: string) {
  const key = normalizeKey(value);
  const current = map.get(key);
  if (current) current.count += 1;
  else map.set(key, { value, count: 1 });
}

function sortedUnmapped(map: Map<string, UnmappedValue>) {
  return [...map.values()].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function resolveSupplier(
  source: string,
  suppliersByName: Map<string, Array<{ id: string; name: string; is_active: boolean }>>,
) {
  const matches = suppliersByName.get(normalizeKey(source)) ?? [];
  if (matches.length === 1) return { id: matches[0].id, issue: null, ambiguous: false };
  if (matches.length > 1) {
    const active = matches.filter((supplier) => supplier.is_active);
    if (active.length === 1) return { id: active[0].id, issue: null, ambiguous: false };
    return {
      id: null,
      issue: `supplier ambiguous: ${source} (${matches.length} matches, NULL)`,
      ambiguous: true,
    };
  }
  return { id: null, issue: `supplier not found: ${source} (NULL)`, ambiguous: false };
}

/**
 * Builds every write before touching the database. Existing products keep
 * their name, unit, price and classification; only NULL category, subcategory
 * and supplier fields may be filled. New products get the form's
 * minimum-stock default.
 */
export function buildProductImportPlan(
  parsed: ParsedProductRows,
  mapping: ProductImportMapping,
  lookups: ProductImportLookups,
): ProductImportPlan {
  const categories = new Map<string, { id: string; name: string }>();
  for (const category of lookups.categories) {
    categories.set(normalizeKey(category.name), category);
  }
  const categoryOverrides = new Map<string, string>();
  for (const [source, target] of Object.entries(mapping.kategori)) {
    if (!categories.has(normalizeKey(target))) {
      throw new Error(`Mapping kategori "${source}" -> "${target}" tidak ditemukan di master.`);
    }
    categoryOverrides.set(normalizeKey(source), target);
  }

  const subcategories = new Map<string, { id: string; name: string }>();
  for (const subcategory of lookups.subcategories) {
    subcategories.set(normalizeKey(subcategory.name), subcategory);
  }
  const subcategoryOverrides = new Map<string, string>();
  for (const [source, target] of Object.entries(mapping.subkategori)) {
    if (!subcategories.has(normalizeKey(target))) {
      throw new Error(`Mapping subkategori "${source}" -> "${target}" tidak ditemukan di master.`);
    }
    subcategoryOverrides.set(normalizeKey(source), target);
  }

  const suppliersByName = new Map<string, Array<{ id: string; name: string; is_active: boolean }>>();
  for (const supplier of lookups.suppliers) {
    const key = normalizeKey(supplier.name);
    const list = suppliersByName.get(key) ?? [];
    list.push(supplier);
    suppliersByName.set(key, list);
  }

  const existingBySku = new Map<string, ExistingProduct>();
  const existingByName = new Map<string, ExistingProduct>();
  const reservedSkuKeys = new Set<string>();
  for (const product of lookups.products) {
    const sku = product.sku.trim();
    existingBySku.set(sku, product);
    reservedSkuKeys.add(sku.toLowerCase());
    const nameKey = normalizeKey(product.name);
    if (!existingByName.has(nameKey)) existingByName.set(nameKey, product);
  }
  for (const record of parsed.records) {
    if (record.sku) reservedSkuKeys.add(record.sku.trim().toLowerCase());
  }

  let highestGenerated = 0;
  for (const key of reservedSkuKeys) {
    const match = /^n-(\d+)$/.exec(key);
    if (match) highestGenerated = Math.max(highestGenerated, Number(match[1]));
  }
  let nextGenerated = highestGenerated + 1;
  const generateSku = () => {
    for (;;) {
      const candidate = `N-${String(nextGenerated).padStart(5, "0")}`;
      nextGenerated += 1;
      if (!reservedSkuKeys.has(candidate.toLowerCase())) {
        reservedSkuKeys.add(candidate.toLowerCase());
        return candidate;
      }
    }
  };

  const issues: ProductImportIssue[] = [...parsed.issues];
  const writes: ProductImportWrite[] = [];
  const unmappedCategories = new Map<string, UnmappedValue>();
  const unmappedSubcategories = new Map<string, UnmappedValue>();
  const drugClassificationCounts: Record<string, number> = {};
  const inferredUnitCounts: Record<string, number> = {};
  const seenSkuRows = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedDuplicate = parsed.skippedDuplicate;
  let generatedSkus = 0;
  let inferredUnits = 0;
  let zeroPrice = 0;
  let supplierNone = 0;
  let supplierAmbiguous = 0;

  for (const record of parsed.records) {
    if (record.sku) {
      const skuKey = record.sku.trim();
      const firstRow = seenSkuRows.get(skuKey);
      if (firstRow !== undefined) {
        skippedDuplicate += 1;
        issues.push({
          rowNumber: record.rowNumber,
          name: record.name,
          issue: `duplicate SKU (first at row ${firstRow})`,
        });
        continue;
      }
      seenSkuRows.set(skuKey, record.rowNumber);
    }

    let categoryId: string | null = null;
    let categoryName: string | null = null;
    if (record.category) {
      const target = categoryOverrides.get(normalizeKey(record.category)) ?? record.category;
      const match = categories.get(normalizeKey(target));
      if (match) {
        categoryId = match.id;
        categoryName = match.name;
      } else {
        addUnmapped(unmappedCategories, record.category);
        issues.push({
          rowNumber: record.rowNumber,
          name: record.name,
          issue: `unmapped category: ${record.category} (NULL)`,
        });
      }
    }

    let subcategoryId: string | null = null;
    if (record.subcategory) {
      const target = subcategoryOverrides.get(normalizeKey(record.subcategory)) ?? record.subcategory;
      const match = subcategories.get(normalizeKey(target));
      if (match) {
        subcategoryId = match.id;
      } else {
        addUnmapped(unmappedSubcategories, record.subcategory);
        issues.push({
          rowNumber: record.rowNumber,
          name: record.name,
          issue: `unmapped subcategory: ${record.subcategory} (NULL)`,
        });
      }
    }

    const classification =
      categoryName && normalizeKey(categoryName) === "psikotropika" && PSYCHOTROPIC_CLASSIFICATION
        ? PSYCHOTROPIC_CLASSIFICATION
        : DEFAULT_DRUG_CLASSIFICATION;
    drugClassificationCounts[classification] = (drugClassificationCounts[classification] ?? 0) + 1;

    let supplierId: string | null = null;
    if (record.supplier) {
      const supplier = resolveSupplier(record.supplier, suppliersByName);
      supplierId = supplier.id;
      if (supplier.ambiguous) supplierAmbiguous += 1;
      else if (supplier.issue) supplierNone += 1;
      if (supplier.issue) {
        issues.push({ rowNumber: record.rowNumber, name: record.name, issue: supplier.issue });
      }
    }

    if (record.price === null || record.price === 0) {
      zeroPrice += 1;
      issues.push({
        rowNumber: record.rowNumber,
        name: record.name,
        issue: "zero/empty price: no selling price",
      });
    }

    const existing = record.sku
      ? existingBySku.get(record.sku.trim())
      : existingByName.get(normalizeKey(record.name));
    if (existing) {
      const nextCategoryId = existing.category_id ?? categoryId;
      const nextSubcategoryId = existing.subcategory_id ?? subcategoryId;
      const nextSupplierId = existing.default_supplier_id ?? supplierId;
      if (
        nextCategoryId !== existing.category_id ||
        nextSubcategoryId !== existing.subcategory_id ||
        nextSupplierId !== existing.default_supplier_id
      ) {
        updated += 1;
        writes.push({
          kind: "update",
          value: {
            rowNumber: record.rowNumber,
            name: record.name,
            id: existing.id,
            category_id: nextCategoryId,
            subcategory_id: nextSubcategoryId,
            default_supplier_id: nextSupplierId,
          },
        });
      } else {
        unchanged += 1;
      }
      continue;
    }

    const sku = record.sku ?? generateSku();
    if (!record.sku) {
      generatedSkus += 1;
      issues.push({ rowNumber: record.rowNumber, name: record.name, issue: `generated SKU: ${sku}` });
    }
    if (record.unitInferred) {
      inferredUnits += 1;
      inferredUnitCounts[record.baseUnit] = (inferredUnitCounts[record.baseUnit] ?? 0) + 1;
      issues.push({
        rowNumber: record.rowNumber,
        name: record.name,
        issue: `inferred unit: ${record.baseUnit}`,
      });
    }

    inserted += 1;
    writes.push({
      kind: "insert",
      value: {
        rowNumber: record.rowNumber,
        name: record.name,
        sku,
        base_unit: record.baseUnit,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        drug_classification: classification,
        default_supplier_id: supplierId,
        minimum_stock: PRODUCT_IMPORT_MINIMUM_STOCK,
        selling_price: record.price !== null && record.price > 0 ? record.price : null,
      },
    });
  }

  issues.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    writes,
    issues,
    summary: {
      read: parsed.read,
      inserted,
      updated,
      unchanged,
      skippedEmpty: parsed.skippedEmpty,
      skippedDuplicate,
      unmappedCategories: sortedUnmapped(unmappedCategories),
      unmappedSubcategories: sortedUnmapped(unmappedSubcategories),
      drugClassificationCounts,
      generatedSkus,
      inferredUnits,
      inferredUnitCounts,
      zeroPrice,
      supplierNone,
      supplierAmbiguous,
    },
  };
}

export function hasUnmapped(summary: ProductImportSummary) {
  return summary.unmappedCategories.length > 0 || summary.unmappedSubcategories.length > 0;
}

export class ProductImportBlockedError extends Error {
  constructor(public readonly plan: ProductImportPlan) {
    const values = [
      ...plan.summary.unmappedCategories.map((entry) => `kategori "${entry.value}" (${entry.count})`),
      ...plan.summary.unmappedSubcategories.map((entry) => `subkategori "${entry.value}" (${entry.count})`),
    ].join(", ");
    super(
      `Import dihentikan: nilai belum dipetakan: ${values}. Perbaiki mapping atau jalankan dengan --allow-unmapped.`,
    );
    this.name = "ProductImportBlockedError";
  }
}

export async function applyProductImportPlan(
  plan: ProductImportPlan,
  store: ProductImportStore,
  options: { allowUnmapped?: boolean } = {},
) {
  if (!options.allowUnmapped && hasUnmapped(plan.summary)) {
    throw new ProductImportBlockedError(plan);
  }
  if (plan.writes.length > 0) await store.apply(plan.writes);
}
