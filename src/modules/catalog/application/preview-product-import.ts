import * as XLSX from "xlsx";

export type ProductImportMasterData = {
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; category_id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; full_code: string }>;
};
export type ProductImportPreviewRow = {
  rowNumber: number; sheetName: string; sheetRowNumber: number;
  sku: string; name: string; genericName: string; manufacturer: string;
  category: string; subcategory: string; baseUnit: string;
  sellingPrice: string; costPrice: string; barcode: string; drugClassification: string;
  minimumStock: string; supplier: string; storageLocation: string; isActive: boolean;
  categoryId: string | null; subcategoryId: string | null;
  defaultSupplierId: string | null; storageLocationId: string | null;
  baseErrors: string[]; valid: boolean; errors: string[];
};
export type ProductImportFileInfo = {
  productSheets: string[]; ignoredSheets: string[];
  mappedColumns: Array<{ sheet: string; column: string; field: string }>;
  ignoredColumns: Array<{ sheet: string; column: string }>;
};
const headerAliases: Record<string, string[]> = {
  sku: ["sku"], name: ["nama produk", "nama barang", "name", "product name"],
  genericName: ["nama generik", "generic name"], manufacturer: ["manufacturer", "produsen"],
  category: ["category", "kategori"], subcategory: ["subcategory", "subkategori"],
  baseUnit: ["base unit", "unit dasar", "satuan dasar", "unit name"],
  sellingPrice: ["selling price", "harga jual"], costPrice: ["cost price", "harga modal", "harga beli"],
  barcode: ["barcode"], drugClassification: ["drug classification", "klasifikasi obat", "classification", "klasifikasi"],
  minimumStock: ["minimum stock", "minimum stok", "stok minimum"], supplier: ["supplier", "default supplier", "pemasok"],
  storageLocation: ["storage location", "lokasi penyimpanan"], isActive: ["is active", "aktif", "status aktif"],
};
const text = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => text(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const fieldFor = (header: string) => Object.keys(headerAliases).find(field => headerAliases[field].includes(normalize(header)));
const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const lookup = <T extends { name: string }>(rows: T[], value: string) => rows.find(row => nameKey(row.name) === nameKey(value));

// Accept unambiguous grouping/decimal formats, without replacing missing prices by zero.
export function normalizeImportNumber(value: string): string {
  let result = value.trim().replace(/^Rp\.?\s*/i, "").replace(/\s/g, "");
  if (!result) return "";
  if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(result)) result = result.replace(/,/g, "");
  else if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(result)) result = result.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(result)) result = result.replace(",", ".");
  return /^-?\d+(\.\d{1,2})?$/.test(result) ? String(Number(result)) : value;
}
function activeValue(value: string): boolean | undefined {
  if (["", "true", "1", "aktif", "ya"].includes(nameKey(value))) return true;
  if (["false", "0", "nonaktif", "tidak", "non aktif"].includes(nameKey(value))) return false;
  return undefined;
}
function classificationValue(value: string) {
  const aliases: Record<string, string> = {
    otc: "otc", "obat bebas": "otc", bebas: "otc",
    "otc limited": "otc_limited", "obat bebas terbatas": "otc_limited", "bebas terbatas": "otc_limited",
    "prescription required": "prescription_required", "obat keras": "prescription_required", "wajib resep": "prescription_required",
  };
  return value ? aliases[normalize(value)] ?? value : "otc";
}
function invalidNumber(value: string, required: boolean, integer = false) {
  if (!value) return required;
  return !/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < 0 || (integer && !Number.isSafeInteger(Number(value)));
}

export function buildProductImportPreviewWithInfo(bytes: ArrayBuffer, fileName: string, master: ProductImportMasterData) {
  if (!/\.(xlsx|csv)$/i.test(fileName)) throw new Error("Format berkas harus .xlsx atau .csv.");
  const workbook = XLSX.read(bytes, { type: "array", raw: false });
  const info: ProductImportFileInfo = { productSheets: [], ignoredSheets: [], mappedColumns: [], ignoredColumns: [] };
  const parsed: Array<{ values: unknown[]; fields: Map<string, number>; sheetName: string; sheetRowNumber: number }> = [];
  for (const sheetName of workbook.SheetNames) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    const headerIndex = values.slice(0, 20).findIndex(row => row.some(value => fieldFor(text(value)) === "sku") && row.some(value => fieldFor(text(value)) === "name"));
    if (headerIndex < 0) { info.ignoredSheets.push(sheetName); continue; }
    const headers = values[headerIndex].map(text);
    const fields = new Map<string, number>();
    headers.forEach((column, index) => {
      const field = fieldFor(column);
      if (field) {
        if (fields.has(field)) throw new Error(`Kolom ganda untuk ${field} pada ${sheetName}.`);
        fields.set(field, index); info.mappedColumns.push({ sheet: sheetName, column, field });
      } else if (column) info.ignoredColumns.push({ sheet: sheetName, column });
    });
    info.productSheets.push(sheetName);
    values.slice(headerIndex + 1).forEach((row, index) => {
      if (row.some(value => text(value) !== "")) parsed.push({ values: row, fields, sheetName, sheetRowNumber: headerIndex + index + 2 });
    });
  }
  if (!info.productSheets.length) throw new Error("Tidak ada sheet dengan kolom SKU dan nama barang.");
  if (parsed.length > 10000) throw new Error("Maksimal 10.000 baris per berkas.");
  const fieldValue = (row: typeof parsed[number], field: string) => { const index = row.fields.get(field); return index === undefined ? "" : text(row.values[index]); };
  const skuCounts = new Map<string, number>(), barcodeCounts = new Map<string, number>();
  for (const row of parsed) {
    const sku = fieldValue(row, "sku").toLocaleLowerCase("id-ID"), barcode = fieldValue(row, "barcode");
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1);
  }
  const rows: ProductImportPreviewRow[] = parsed.map((row, index) => {
    const get = (field: string) => fieldValue(row, field);
    const sku = get("sku"), name = get("name"), category = get("category"), subcategory = get("subcategory"), baseUnit = get("baseUnit"), barcode = get("barcode");
    const sellingPrice = normalizeImportNumber(get("sellingPrice")), costPrice = normalizeImportNumber(get("costPrice")), minimumStock = normalizeImportNumber(get("minimumStock"));
    const drugClassification = classificationValue(get("drugClassification"));
    const isActive = activeValue(get("isActive"));
    const supplier = get("supplier"), storageLocation = get("storageLocation");
    const baseErrors: string[] = [];
    const resolvedCategory = lookup(master.categories, category);
    const matchingSubcategories = master.subcategories.filter(item => nameKey(item.name) === nameKey(subcategory) && (!resolvedCategory || item.category_id === resolvedCategory.id));
    const resolvedSubcategory = matchingSubcategories.length === 1 ? matchingSubcategories[0] : undefined;
    for (const [label, value] of [["SKU", sku], ["Nama produk", name], ["Kategori", category], ["Subkategori", subcategory], ["Unit dasar", baseUnit]]) if (!value) baseErrors.push(`${label} wajib diisi.`);
    if (invalidNumber(sellingPrice, true)) baseErrors.push("Harga jual tidak valid.");
    if (invalidNumber(costPrice, false)) baseErrors.push("Harga modal tidak valid.");
    if (invalidNumber(minimumStock, false, true)) baseErrors.push("Minimum stok tidak valid.");
    if (!["otc", "otc_limited", "prescription_required"].includes(drugClassification)) baseErrors.push("Klasifikasi obat tidak valid atau belum diverifikasi.");
    if (isActive === undefined) baseErrors.push("Status aktif tidak valid.");
    if (sku && (skuCounts.get(sku.toLocaleLowerCase("id-ID")) ?? 0) > 1) baseErrors.push("SKU duplikat di dalam berkas.");
    if (barcode && (barcodeCounts.get(barcode) ?? 0) > 1) baseErrors.push("Barcode duplikat di dalam berkas.");
    const categoryId = resolvedCategory?.id ?? null, subcategoryId = resolvedSubcategory?.id ?? null;
    const defaultSupplierId = supplier ? lookup(master.suppliers, supplier)?.id ?? null : null;
    const storageLocationId = storageLocation ? master.locations.find(item => nameKey(item.full_code) === nameKey(storageLocation))?.id ?? null : null;
    const errors = [...baseErrors];
    if (category && !categoryId) errors.push("Kategori tidak ditemukan pada data acuan.");
    if (subcategory && !subcategoryId) errors.push("Subkategori tidak ditemukan pada data acuan.");
    if (categoryId && subcategoryId && resolvedSubcategory?.category_id !== categoryId) errors.push("Subkategori tidak sesuai dengan kategori.");
    if (supplier && !defaultSupplierId) errors.push("Pemasok tidak ditemukan pada data acuan.");
    if (storageLocation && !storageLocationId) errors.push("Lokasi penyimpanan tidak ditemukan pada data acuan.");
    const rawManufacturer = get("manufacturer");
    const manufacturer = /^(belum diketahui(?:\s*\(dummy\))?|unknown|dummy|n\/a)$/i.test(rawManufacturer) ? "" : rawManufacturer;
    return { rowNumber: index + 2, sheetName: row.sheetName, sheetRowNumber: row.sheetRowNumber, sku, name, genericName: get("genericName"), manufacturer, category, subcategory, baseUnit, sellingPrice, costPrice, barcode, drugClassification, minimumStock, supplier, storageLocation, isActive: isActive ?? false, categoryId, subcategoryId, defaultSupplierId, storageLocationId, baseErrors, valid: errors.length === 0, errors };
  });
  return { rows, info };
}
export function buildProductImportPreview(bytes: ArrayBuffer, fileName: string, master: ProductImportMasterData): ProductImportPreviewRow[] {
  return buildProductImportPreviewWithInfo(bytes, fileName, master).rows;
}
