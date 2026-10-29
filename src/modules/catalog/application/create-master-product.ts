import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PosDomainError, mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { parseMasterProductInput } from "../master-product-input";

export async function createMasterProduct(value: unknown) {
  const input = parseMasterProductInput(value);
  const client = createAdminSupabaseClient();
  // A single insert is atomic. The existing composite FK validates category/subcategory.
  // No selling unit or batch exists until an explicit, priced operation creates it.
  const result = await client.from("products").insert(input).select("id").single();
  if (result.error) {
    const message = result.error.message;
    if (message.includes("products_sku_key")) throw new PosDomainError("DUPLICATE_SKU");
    if (message.includes("fk_products_subcategory_category")) throw new PosDomainError("INVALID_CATEGORY_SUBCATEGORY");
    if (message.includes("products_default_supplier_id_fkey")) throw new PosDomainError("INVALID_SUPPLIER");
    throw mapDatabaseError(result.error);
  }
  return { product_id: result.data.id };
}
