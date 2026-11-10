import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { buildCashierProductResults } from "../search";

export async function searchCashierProducts(query:string) {
  if(!query)return [];
  const admin=createAdminSupabaseClient();
  const products=await admin.from("products")
    .select("id,sku,name,requires_prescription,product_units(id,unit_name,conversion_to_base,selling_price,barcode,is_base_unit,is_active)")
    .eq("is_active",true).or(`name.ilike.%${query}%,sku.ilike.%${query}%`).order("name").limit(20);
  if(products.error)throw mapDatabaseError(products.error);if(!products.data.length)return [];
  const businessDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const batches=await admin.from("product_batches").select("product_id,quantity").in("product_id",products.data.map(product=>product.id)).gt("quantity",0).or(`expired_date.is.null,expired_date.gte.${businessDate}`);
  if(batches.error)throw mapDatabaseError(batches.error);
  return buildCashierProductResults(products.data,batches.data);
}

export async function findCashierProductByBarcode(barcode:string) {
  const admin=createAdminSupabaseClient();
  const unit=await admin.from("product_units").select("id,unit_name,conversion_to_base,selling_price,barcode,is_active,products!inner(id,sku,name,requires_prescription,is_active)").eq("barcode",barcode).eq("is_active",true).maybeSingle();
  if(unit.error)throw mapDatabaseError(unit.error);if(!unit.data)return null;if(!unit.data.products.is_active)return {inactive:true as const};
  const product=unit.data.products;const businessDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const batches=await admin.from("product_batches").select("quantity").eq("product_id",product.id).gt("quantity",0).or(`expired_date.is.null,expired_date.gte.${businessDate}`);
  if(batches.error)throw mapDatabaseError(batches.error);return {inactive:false as const,product:{id:product.id,name:product.name,sku:product.sku,requiresPrescription:product.requires_prescription===true,availableStockBase:(batches.data??[]).reduce((total,batch)=>total+batch.quantity,0),units:[{id:unit.data.id,label:unit.data.unit_name,conversionToBase:unit.data.conversion_to_base,displayedUnitPrice:unit.data.selling_price,barcode:unit.data.barcode}]},unitId:unit.data.id};
}

export async function getCashierProductAvailability(productIds:string[]) {
  if(!productIds.length)return [];
  const admin=createAdminSupabaseClient();
  const businessDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const batches=await admin.from("product_batches").select("product_id,quantity").in("product_id",productIds).gt("quantity",0).or(`expired_date.is.null,expired_date.gte.${businessDate}`);
  if(batches.error)throw mapDatabaseError(batches.error);
  const totals=new Map(productIds.map(id=>[id,0]));
  for(const batch of batches.data??[])totals.set(batch.product_id,(totals.get(batch.product_id)??0)+batch.quantity);
  return [...totals].map(([productId,availableStockBase])=>({productId,availableStockBase}));
}

export async function listProductInventory(productId:string) {
  const {data,error}=await createAdminSupabaseClient().from("product_batches")
    .select("id,product_id,batch_number,expired_date,quantity,received_date")
    .eq("product_id",productId).order("expired_date", { nullsFirst: false }).order("created_at");
  if(error) throw mapDatabaseError(error); return data;
}
