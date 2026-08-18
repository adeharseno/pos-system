import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { buildCashierProductResults } from "../search";

export async function searchCashierProducts(query:string) {
  if(!query)return [];
  const admin=createAdminSupabaseClient();
  const products=await admin.from("products")
    .select("id,sku,name,requires_prescription,product_units(id,unit_name,conversion_to_base,selling_price,barcode)")
    .eq("is_active",true).or(`name.ilike.%${query}%,sku.ilike.%${query}%`).order("name").limit(20);
  if(products.error)throw mapDatabaseError(products.error);if(!products.data.length)return [];
  const businessDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const batches=await admin.from("product_batches").select("product_id,quantity").in("product_id",products.data.map(product=>product.id)).gt("quantity",0).gte("expired_date",businessDate);
  if(batches.error)throw mapDatabaseError(batches.error);
  return buildCashierProductResults(products.data,batches.data);
}

export async function listProductInventory(productId:string) {
  const {data,error}=await createAdminSupabaseClient().from("product_batches")
    .select("id,product_id,batch_number,expired_date,quantity,received_date")
    .eq("product_id",productId).order("expired_date").order("created_at");
  if(error) throw mapDatabaseError(error); return data;
}
