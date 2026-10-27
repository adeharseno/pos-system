import "server-only";
import { createProduct } from "./create-product";
import { getProductCreateMasterData } from "../data/admin-product-queries";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { commitProductImportWith } from "./product-import-commit";
export type { ProductImportCommitRow, ProductImportCommitResult } from "./product-import-commit";

export async function commitProductImport(payload: unknown) {
  return commitProductImportWith(payload, {
    master: getProductCreateMasterData,
    create: createProduct,
    existing: async (skus, barcodes) => {
      const client = createAdminSupabaseClient();
      const [products, units] = await Promise.all([
        client.from("products").select("sku").in("sku", skus),
        barcodes.length ? client.from("product_units").select("barcode").in("barcode", barcodes) : Promise.resolve({ data: [], error: null }),
      ]);
      if (products.error) throw mapDatabaseError(products.error);
      if (units.error) throw mapDatabaseError(units.error);
      return { skus: (products.data ?? []).map(value => value.sku), barcodes: (units.data ?? []).flatMap(value => value.barcode ? [value.barcode] : []) };
    },
  });
}
