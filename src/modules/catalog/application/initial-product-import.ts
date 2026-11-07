import * as XLSX from "xlsx";
import type { ProductImportMasterData } from "./preview-product-import";
import { normalizeImportNumber } from "./preview-product-import";

export type InitialImportRow = {
  rowNumber: number; sku: string; generatedSku: boolean; name: string; baseUnit: string | null;
  sellingPrice: number; costPrice: number; stock: number;
  categoryId: string | null; subcategoryId: string | null; supplierId: string | null;
  categoryName: string | null; subcategoryName: string | null; supplierText: string | null;
  drugClassification: "otc" | "prescription_required";
  warnings: string[]; errors: string[];
};

const REQUIRED_HEADERS = [
  "Nama", "Harga", "SKU", "Satuan Dasar", "Sub kategori", "Klasifikasi", "Stok", "Supplier",
] as const;

const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: string) => value.replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const find = <T extends { name: string }>(rows: T[], value: string) => rows.find(row => key(row.name) === key(value));
const money = (value: unknown) => normalizeImportNumber(clean(value));
const isMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);
const isWholeNumber = (value: string) => /^\d+$/.test(value);
const validCategories = new Map([["obat bebas", "Obat Bebas"], ["obat resep", "Obat Resep"], ["racik", "Racik"], ["psikotropika", "Psikotropika"]]);
const validSubcategories = new Map(["alkes", "bebas", "cream", "infus", "injeksi", "obat tetes", "supp", "syrup", "tablet"].map(value => [value, value.replace(/\b\w/g, char => char.toUpperCase())]));

function classificationFor(category: string): InitialImportRow["drugClassification"] {
  const normalized = key(category);
  return normalized === "obat resep" || normalized === "psikotropika"
    ? "prescription_required"
    : "otc";
}

export function buildInitialProductImportPreview(bytes: ArrayBuffer, fileName: string, master: ProductImportMasterData) {
  if (!/\.xlsx$/i.test(fileName)) throw new Error("Format berkas harus .xlsx.");
  const workbook = XLSX.read(bytes, { type: "array", raw: false });
  const sheet = workbook.Sheets.Produk ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Sheet Produk tidak ditemukan.");
  // raw:false keeps SKU as displayed text so leading zeros survive.
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
  if (!values.length || values.length > 10000) throw new Error("Berkas harus berisi 1 sampai 10.000 baris.");
  const headers = new Set(Object.keys(values[0]));
  for (const header of REQUIRED_HEADERS) if (!headers.has(header)) throw new Error(`Kolom ${header} tidak ditemukan.`);

  const skuCounts = new Map<string, number>();
  const reservedSkus = new Set<string>();
  const nameCounts = new Map<string, number>();
  for (const source of values) {
    const sku = key(clean(source.SKU));
    if (sku) { skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1); reservedSkus.add(sku); }
    const name = key(clean(source.Nama));
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const rows: InitialImportRow[] = values.map((source, index) => {
    const errors: string[] = [], warnings: string[] = [];
    const name = clean(source.Nama);
    const originalSku = clean(source.SKU);
    let sku = originalSku;
    if (!sku) {
      const base = `INT-${String(index + 2).padStart(5, "0")}`;
      sku = base;
      for (let suffix = 2; reservedSkus.has(key(sku)); suffix += 1) sku = `${base}-${suffix}`;
      reservedSkus.add(key(sku));
    }
    const baseUnit = clean(source["Satuan Dasar"]) || null;
    const category = clean(source.Klasifikasi);
    const subcategory = clean(source["Sub kategori"]);
    const supplier = clean(source.Supplier);
    // Missing Harga Modal is intentional; it is stored as numeric 0.
    const selling = money(source.Harga);
    const cost = money(source["Harga Modal"]);
    const stockValue = money(source.Stok);

    const categoryName = category ? validCategories.get(key(category)) ?? null : null;
    const subcategoryName = subcategory ? validSubcategories.get(key(subcategory)) ?? null : null;
    const categoryId = categoryName ? find(master.categories, categoryName)?.id ?? null : null;
    const subcategoryId = subcategoryName ? find(master.subcategories, subcategoryName)?.id ?? null : null;
    const supplierId = supplier ? find(master.suppliers, supplier)?.id ?? null : null;

    if (!name) errors.push("Nama wajib diisi.");
    if (!originalSku) warnings.push(`SKU internal dibuat: ${sku}.`);
    if (!baseUnit) warnings.push("Satuan belum ditentukan; penjualan akan diblokir.");
    if (!category) warnings.push("Kategori belum ditentukan."); else if (!categoryName) errors.push("Klasifikasi Excel tidak dikenali.");
    if (!subcategory) warnings.push("Sub kategori belum ditentukan."); else if (!subcategoryName) errors.push("Sub kategori Excel tidak dikenali.");
    if (supplier && !supplierId) warnings.push("Supplier belum terhubung; teks asli tetap disimpan.");
    if ((nameCounts.get(key(name)) ?? 0) > 1) warnings.push("Nama barang duplikat; tetap dibuat terpisah.");
    if (!selling || !isMoney(selling)) errors.push("Harga tidak valid.");
    if (cost && !isMoney(cost)) errors.push("Harga Modal tidak valid.");
    if (!stockValue || !isWholeNumber(stockValue)) errors.push("Stok harus bilangan bulat minimal 0.");
    if (originalSku && (skuCounts.get(key(sku)) ?? 0) > 1) errors.push("SKU duplikat di dalam berkas.");

    return {
      rowNumber: index + 2,
      sku, generatedSku: !originalSku,
      name,
      baseUnit,
      sellingPrice: isMoney(selling) ? Number(selling) : 0,
      costPrice: isMoney(cost) ? Number(cost) : 0,
      stock: isWholeNumber(stockValue) ? Number(stockValue) : 0,
      categoryId,
      subcategoryId,
      supplierId, categoryName, subcategoryName, supplierText: supplier || null,
      drugClassification: classificationFor(category),
      warnings, errors,
    };
  });

  return {
    rows,
    valid: rows.filter(row => !row.errors.length).length,
    errors: rows.filter(row => row.errors.length).length,
    warnings: rows.filter(row => row.warnings.length).length,
    totalStock: rows.reduce((sum, row) => sum + (row.errors.length ? 0 : row.stock), 0),
  };
}

export function initialImportRpcRows(rows: InitialImportRow[]) {
  return rows.map(row => ({
    sku: row.sku,
    name: row.name,
    base_unit: row.baseUnit,
    selling_price: row.sellingPrice,
    cost_price: row.costPrice,
    stock: row.stock,
    category_id: row.categoryId,
    subcategory_id: row.subcategoryId,
    supplier_id: row.supplierId,
    category_name: row.categoryName,
    subcategory_name: row.subcategoryName,
    supplier_text: row.supplierText,
    drug_classification: row.drugClassification,
  }));
}

export function validateInitialImportConfirmation(preview: { errors: number; warnings: number }, warningsAcknowledged: boolean) {
  if (preview.errors) throw new Error("Berkas masih memiliki baris yang tidak valid.");
  if (preview.warnings && !warningsAcknowledged) throw new Error("Peringatan impor harus disetujui terlebih dahulu.");
}
