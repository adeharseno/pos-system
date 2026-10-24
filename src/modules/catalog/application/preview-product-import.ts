import * as XLSX from "xlsx";

export type ProductImportMasterData = {
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; category_id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; full_code: string }>;
};

export type ProductImportPreviewRow = {
  rowNumber: number;
  sku: string;
  name: string;
  genericName: string;
  manufacturer: string;
  category: string;
  subcategory: string;
  baseUnit: string;
  sellingPrice: string;
  costPrice: string;
  barcode: string;
  drugClassification: string;
  minimumStock: string;
  supplier: string;
  storageLocation: string;
  categoryId: string | null;
  subcategoryId: string | null;
  defaultSupplierId: string | null;
  storageLocationId: string | null;
  baseErrors: string[];
  valid: boolean;
  errors: string[];
};

const headerAliases: Record<string, string[]> = {
  sku: ["sku"],
  name: ["nama produk", "name", "product name"],
  genericName: ["nama generik", "generic name"],
  manufacturer: ["manufacturer", "produsen"],
  category: ["category", "kategori"],
  subcategory: ["subcategory", "subkategori"],
  baseUnit: ["base unit", "unit dasar"],
  sellingPrice: ["selling price", "harga jual"],
  costPrice: ["cost price", "harga modal"],
  barcode: ["barcode"],
  drugClassification: ["drug classification", "klasifikasi obat"],
  minimumStock: ["minimum stock", "minimum stok"],
  supplier: ["supplier", "default supplier"],
  storageLocation: ["storage location", "lokasi penyimpanan"],
};

const normalizeHeader = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("id-ID");
const text = (value: unknown) => String(value ?? "").trim();
const keyFor = (headers: string[], field: string) => headers.findIndex((header) => headerAliases[field].includes(normalizeHeader(header)));
const fieldValue = (values: unknown[], headers: string[], field: string) => {
  const index = keyFor(headers, field);
  return index < 0 ? "" : text(values[index]);
};
const lookup = <T extends { name: string }>(rows: T[], value: string) => rows.find((row) => row.name.trim().toLocaleLowerCase("id-ID") === value.toLocaleLowerCase("id-ID"));

function invalidNumber(value: string, required: boolean) {
  if (!value) return required;
  const number = Number(value);
  return !Number.isFinite(number) || number < 0;
}

function parseRows(bytes: ArrayBuffer, fileName: string) {
  const extension = fileName.toLocaleLowerCase("id-ID").split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("Format file harus .xlsx atau .csv.");
  const workbook = XLSX.read(bytes, { type: "array", raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("File tidak memiliki sheet.");
  const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], { header: 1, defval: "", raw: false });
  const [headers = [], ...rows] = values;
  if (headers.length === 0) throw new Error("File tidak memiliki header.");
  return { headers: headers.map(text), rows };
}

export function buildProductImportPreview(bytes: ArrayBuffer, fileName: string, master: ProductImportMasterData): ProductImportPreviewRow[] {
  const { headers, rows } = parseRows(bytes, fileName);
  const parsed = rows
    .map((values, index) => ({ values, rowNumber: index + 2 }))
    .filter(({ values }) => values.some((value) => text(value) !== ""));
  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();

  for (const { values } of parsed) {
    const sku = fieldValue(values, headers, "sku").toLocaleLowerCase("id-ID");
    const barcode = fieldValue(values, headers, "barcode");
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1);
  }

  return parsed.map(({ values, rowNumber }) => {
    const sku = fieldValue(values, headers, "sku");
    const name = fieldValue(values, headers, "name");
    const category = fieldValue(values, headers, "category");
    const subcategory = fieldValue(values, headers, "subcategory");
    const baseUnit = fieldValue(values, headers, "baseUnit");
    const sellingPrice = fieldValue(values, headers, "sellingPrice");
    const costPrice = fieldValue(values, headers, "costPrice");
    const barcode = fieldValue(values, headers, "barcode");
    const drugClassification = fieldValue(values, headers, "drugClassification") || "otc";
    const minimumStock = fieldValue(values, headers, "minimumStock");
    const supplier = fieldValue(values, headers, "supplier");
    const storageLocation = fieldValue(values, headers, "storageLocation");
    const baseErrors: string[] = [];
    const resolvedCategory = category ? lookup(master.categories, category) : undefined;
    const resolvedSubcategory = subcategory ? lookup(master.subcategories, subcategory) : undefined;

    if (!sku) baseErrors.push("SKU wajib diisi.");
    if (!name) baseErrors.push("Nama produk wajib diisi.");
    if (!category) baseErrors.push("Kategori wajib diisi.");
    if (!subcategory) baseErrors.push("Subkategori wajib diisi.");
    if (!baseUnit) baseErrors.push("Unit dasar wajib diisi.");
    if (invalidNumber(sellingPrice, true)) baseErrors.push("Harga jual tidak valid.");
    if (invalidNumber(costPrice, false)) baseErrors.push("Harga modal tidak valid.");
    if (invalidNumber(minimumStock, false)) baseErrors.push("Minimum stok tidak valid.");
    if (!["otc", "otc_limited", "prescription_required"].includes(drugClassification)) baseErrors.push("Klasifikasi obat tidak valid.");
    if (sku && (skuCounts.get(sku.toLocaleLowerCase("id-ID")) ?? 0) > 1) baseErrors.push("SKU duplikat di dalam file.");
    if (barcode && (barcodeCounts.get(barcode) ?? 0) > 1) baseErrors.push("Barcode duplikat di dalam file.");
    const categoryId = resolvedCategory?.id ?? null;
    const subcategoryId = resolvedSubcategory?.id ?? null;
    const defaultSupplierId = supplier ? lookup(master.suppliers, supplier)?.id ?? null : null;
    const storageLocationId = storageLocation ? master.locations.find((location) => location.full_code.trim().toLocaleLowerCase("id-ID") === storageLocation.toLocaleLowerCase("id-ID"))?.id ?? null : null;
    const errors = [...baseErrors];
    if (category && !categoryId) errors.push("Kategori tidak ditemukan pada master data.");
    if (subcategory && !subcategoryId) errors.push("Subkategori tidak ditemukan pada master data.");
    if (categoryId && subcategoryId && resolvedSubcategory?.category_id !== categoryId) errors.push("Subkategori tidak sesuai dengan kategori.");
    if (supplier && !defaultSupplierId) errors.push("Supplier tidak ditemukan pada master data.");
    if (storageLocation && !storageLocationId) errors.push("Lokasi penyimpanan tidak ditemukan pada master data.");

    return {
      rowNumber, sku, name,
      genericName: fieldValue(values, headers, "genericName"),
      manufacturer: fieldValue(values, headers, "manufacturer"),
      category, subcategory, baseUnit, sellingPrice, costPrice, barcode, drugClassification, minimumStock, supplier, storageLocation,
      categoryId, subcategoryId, defaultSupplierId, storageLocationId, baseErrors,
      valid: errors.length === 0,
      errors,
    };
  });
}
