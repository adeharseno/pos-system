import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { Database } from "@/types/database.types";
import type { AdminProductFilters } from "../admin-product-filters";
import { marginFromSellingPrice } from "../product-pricing";

type Product=Database["public"]["Tables"]["products"]["Row"];
type Unit=Database["public"]["Tables"]["product_units"]["Row"];
type Batch=Database["public"]["Tables"]["product_batches"]["Row"];
type Named={id:string;name:string};
export type AdminProductListItem={id:string;sku:string;name:string;genericName:string|null;manufacturer:string|null;baseUnit:string;requiresPrescription:boolean;isActive:boolean;category:string;subcategory:string;defaultSupplier:string|null;storageLocation:string|null;unitCount:number;availableStock:number;minimumStock:number;baseSellingPrice:number|null};
type DisplayBatch=Omit<Batch,"cost_price">&{cost_price?:number};
export type AdminProductDetail=AdminProductListItem&{categoryId:string;subcategoryId:string;defaultSupplierId:string|null;storageLocationId:string|null;drugClassification:Product["drug_classification"];description:string|null;costPrice?:number|null;marginPercent?:number|null;taxRate:number;isTaxable:boolean;minimumStock:number;units:Unit[];batches:DisplayBatch[]};

const businessDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fail=<T>(error:{message:string}|null,data:T)=>{if(error)throw mapDatabaseError(error);return data;};
const ids=<T extends {id:string}>(rows:T[])=>rows.map(row=>row.id);
const byId=(rows:Named[])=>new Map(rows.map(row=>[row.id,row.name]));

async function metadata(products:Product[]){
  const admin=createAdminSupabaseClient();const productIds=ids(products);
  const [unitsResult,batchesResult,categoriesResult,subcategoriesResult,suppliersResult,locationsResult]=await Promise.all([
    admin.from("product_units").select("*").in("product_id",productIds),
    admin.from("product_batches").select("*").in("product_id",productIds).gt("quantity",0).gte("expired_date",businessDate()).order("expired_date").order("created_at"),
    admin.from("categories").select("id,name"),admin.from("subcategories").select("id,name"),admin.from("suppliers").select("id,name"),admin.from("storage_locations").select("id,full_code"),
  ]);
  const units=fail(unitsResult.error,unitsResult.data??[]);const batches=fail(batchesResult.error,batchesResult.data??[]);
  const locations=fail(locationsResult.error,locationsResult.data??[]).map(location=>({id:location.id,name:location.full_code}));
  return {units,batches,categories:byId(fail(categoriesResult.error,categoriesResult.data??[])),subcategories:byId(fail(subcategoriesResult.error,subcategoriesResult.data??[])),suppliers:byId(fail(suppliersResult.error,suppliersResult.data??[])),locations:byId(locations)};
}
function summary(product:Product, data:Awaited<ReturnType<typeof metadata>>):AdminProductListItem{
  const productUnits=data.units.filter(unit=>unit.product_id===product.id);const stock=data.batches.filter(batch=>batch.product_id===product.id).reduce((total,batch)=>total+batch.quantity,0);const baseUnit=productUnits.find(unit=>unit.is_base_unit);
  return {id:product.id,sku:product.sku,name:product.name,genericName:product.generic_name,manufacturer:product.manufacturer,baseUnit:product.base_unit,requiresPrescription:product.requires_prescription===true,isActive:product.is_active,category:data.categories.get(product.category_id)??"—",subcategory:data.subcategories.get(product.subcategory_id)??"—",defaultSupplier:product.default_supplier_id?data.suppliers.get(product.default_supplier_id)??"—":null,storageLocation:product.storage_location_id?data.locations.get(product.storage_location_id)??"—":null,unitCount:productUnits.length,availableStock:stock,minimumStock:product.minimum_stock,baseSellingPrice:baseUnit?.selling_price??null};
}
export async function listAdminProducts(filters:AdminProductFilters){
  const admin=createAdminSupabaseClient();let query=admin.from("products").select("*",{count:"exact"}).order("name").order("id");
  if(filters.status!=="all")query=query.eq("is_active",filters.status==="active");if(filters.prescription!=="all")query=query.eq("requires_prescription",filters.prescription==="required");if(filters.q){
    const barcode = await admin.from("product_units").select("product_id").eq("barcode",filters.q).maybeSingle();
    if(barcode.error)throw mapDatabaseError(barcode.error);
    const term=filters.q.replace(/[%_]/g,"\\$&");
    query=query.or(`name.ilike.%${term}%,sku.ilike.%${term}%${barcode.data?`,id.eq.${barcode.data.product_id}`:""}`);
  };
  const from=(filters.page-1)*filters.limit;const result=await query.range(from,from+filters.limit-1);const products=fail(result.error,result.data??[]);if(products.length===0)return {rows:[] as AdminProductListItem[],total:result.count??0};const data=await metadata(products);return {rows:products.map(product=>summary(product,data)),total:result.count??0};
}
export async function getAdminProduct(id:string,includeSensitivePricing=false):Promise<AdminProductDetail|null>{
  const admin=createAdminSupabaseClient();const result=await admin.from("products").select("*").eq("id",id).maybeSingle();const product=fail(result.error,result.data);if(!product)return null;const data=await metadata([product]);const baseUnit=data.units.find(unit=>unit.product_id===product.id&&unit.is_base_unit);const detail={...summary(product,data),categoryId:product.category_id,subcategoryId:product.subcategory_id,defaultSupplierId:product.default_supplier_id,storageLocationId:product.storage_location_id,drugClassification:product.drug_classification,description:product.description,taxRate:product.tax_rate,isTaxable:product.is_taxable,minimumStock:product.minimum_stock,units:data.units.sort((a,b)=>a.unit_name.localeCompare(b.unit_name)),batches:includeSensitivePricing?data.batches:data.batches.map(batch=>({id:batch.id,product_id:batch.product_id,batch_number:batch.batch_number,expired_date:batch.expired_date,quantity:batch.quantity,received_date:batch.received_date,created_at:batch.created_at,updated_at:batch.updated_at}))};if(!includeSensitivePricing)return detail;return {...detail,costPrice:product.cost_price,marginPercent:marginFromSellingPrice(product.cost_price??Number.NaN,product.tax_rate,baseUnit?.selling_price??Number.NaN)};
}
export async function getProductCreateMasterData(){const admin=createAdminSupabaseClient();const [categories,subcategories,suppliers,locations,taxes]=await Promise.all([admin.from("categories").select("id,name").eq("is_active",true).order("name"),admin.from("subcategories").select("id,category_id,name").eq("is_active",true).order("name"),admin.from("suppliers").select("id,name").eq("is_active",true).order("name"),admin.from("storage_locations").select("id,full_code").order("full_code"),admin.from("tax_rates").select("id,name,rate").eq("is_active",true).order("rate").order("name")]);return{categories:fail(categories.error,categories.data??[]),subcategories:fail(subcategories.error,subcategories.data??[]),suppliers:fail(suppliers.error,suppliers.data??[]),locations:fail(locations.error,locations.data??[]),taxes:fail(taxes.error,taxes.data??[])};}
export async function listActiveProductsForReceiving(){const admin=createAdminSupabaseClient();const [productsResult,batchesResult]=await Promise.all([admin.from("products").select("id,sku,name,base_unit,cost_price").eq("is_active",true).order("name"),admin.from("product_batches").select("product_id,quantity").gt("quantity",0).gte("expired_date",businessDate())]);const products=fail(productsResult.error,productsResult.data??[]);const batches=fail(batchesResult.error,batchesResult.data??[]);const stockByProduct=new Map<string,number>();for(const batch of batches)stockByProduct.set(batch.product_id,(stockByProduct.get(batch.product_id)??0)+batch.quantity);return products.map(product=>({...product,current_stock:stockByProduct.get(product.id)??0}));}
export async function listCategoriesForManagement(){const admin=createAdminSupabaseClient();const [categories,subcategories]=await Promise.all([admin.from("categories").select("id,name").order("name"),admin.from("subcategories").select("id,category_id,name").order("name")]);return{categories:fail(categories.error,categories.data??[]),subcategories:fail(subcategories.error,subcategories.data??[])};}
