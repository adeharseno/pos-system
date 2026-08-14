import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

export async function listActiveProducts() {
  const {data,error}=await createAdminSupabaseClient().from("products")
    .select("id,sku,name,base_unit,drug_classification,is_taxable,tax_rate,product_units(id,unit_name,conversion_to_base,selling_price,barcode,is_base_unit)")
    .eq("is_active",true).order("name");
  if(error) throw mapDatabaseError(error); return data;
}

export async function listProductInventory(productId:string) {
  const {data,error}=await createAdminSupabaseClient().from("product_batches")
    .select("id,product_id,batch_number,expired_date,quantity,cost_price,received_date")
    .eq("product_id",productId).order("expired_date").order("created_at");
  if(error) throw mapDatabaseError(error); return data;
}
