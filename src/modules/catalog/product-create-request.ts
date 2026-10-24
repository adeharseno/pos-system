export type CreateProductRequest = {
  sku: string; name: string; category_id: string; subcategory_id: string; base_unit: string; selling_price: number;
  generic_name: string | null; description: string | null; manufacturer: string | null;
  storage_location_id: string | null; default_supplier_id: string | null;
  cost_price: number; tax_rate: number; minimum_stock: number; is_taxable: boolean; is_active: boolean;
  barcode: string | null; drug_classification: "otc" | "otc_limited" | "prescription_required";
  initial_stock?: { expired_date: string; quantity: number };
};

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const optional = (form: FormData, key: string) => text(form, key) || null;
const number = (form: FormData, key: string) => {
  const raw = text(form, key);
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
};

export function createProductRequest(form: FormData, categoryId: string, subcategoryId: string): CreateProductRequest {
  const classification = text(form, "drug_classification");
  const drug_classification: CreateProductRequest["drug_classification"] = classification === "otc_limited" ? "otc_limited" : classification === "prescription_required" ? "prescription_required" : "otc";
  const initialStock = form.get("add_initial_stock") === "on"
    ? { expired_date: text(form, "initial_expired_date"), quantity: number(form, "initial_quantity") }
    : undefined;
  return {
    sku: text(form, "sku"), name: text(form, "name"), category_id: categoryId, subcategory_id: subcategoryId,
    base_unit: text(form, "base_unit"), selling_price: number(form, "selling_price"), generic_name: optional(form, "generic_name"),
    description: optional(form, "description"), manufacturer: optional(form, "manufacturer"),
    storage_location_id: optional(form, "storage_location_id"), default_supplier_id: optional(form, "default_supplier_id"),
    cost_price: number(form, "cost_price"), tax_rate: number(form, "tax_rate"), minimum_stock: number(form, "minimum_stock"),
    is_taxable: form.get("is_taxable") === "on", is_active: form.get("is_active") === "on", barcode: optional(form, "barcode"), drug_classification,
    ...(initialStock ? { initial_stock: initialStock } : {}),
  };
}
