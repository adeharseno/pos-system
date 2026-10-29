import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import type { Database } from "@/types/database.types";

export function createMasterProductRequest(form: FormData, categoryId: string, subcategoryId: string) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  return {
    sku: text("sku"), name: text("name"), manufacturer: text("manufacturer"),
    description: text("description"), category_id: categoryId, subcategory_id: subcategoryId,
    base_unit: text("base_unit"), drug_classification: text("drug_classification"),
    minimum_stock: text("minimum_stock") === "" ? 5 : Number(text("minimum_stock")),
    default_supplier_id: text("default_supplier_id") || null,
  };
}

export function parseMasterProductInput(value: unknown): Database["public"]["Tables"]["products"]["Insert"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Data produk tidak valid.");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["sku", "name", "manufacturer", "description", "category_id", "subcategory_id", "base_unit", "drug_classification", "minimum_stock", "default_supplier_id"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new PosInputError("Master produk tidak menerima data harga atau stok awal.");
  const text = (key: string, required = false) => {
    const raw = body[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw new PosInputError(`${key} tidak valid.`);
    const result = typeof raw === "string" ? raw.trim() : "";
    if (required && !result) throw new PosInputError(`${key} wajib diisi.`);
    return result;
  };
  const classification = body.drug_classification ?? "otc";
  if (classification !== "otc" && classification !== "otc_limited" && classification !== "prescription_required") throw new PosInputError("Klasifikasi obat tidak valid.");
  const minimumStock = body.minimum_stock === undefined ? 5 : body.minimum_stock;
  if (typeof minimumStock !== "number" || !Number.isInteger(minimumStock) || minimumStock < 0 || minimumStock > 2147483647) throw new PosInputError("Minimum stok harus bilangan bulat 0 atau lebih.");
  const supplier = text("default_supplier_id");
  return {
    sku: text("sku", true), name: text("name", true), manufacturer: text("manufacturer") || null,
    description: text("description") || null, base_unit: text("base_unit", true),
    category_id: requireUuid(text("category_id", true), "category_id"),
    subcategory_id: requireUuid(text("subcategory_id", true), "subcategory_id"),
    drug_classification: classification, minimum_stock: minimumStock,
    default_supplier_id: supplier ? requireUuid(supplier, "default_supplier_id") : null,
    cost_price: null, is_active: true,
  };
}
