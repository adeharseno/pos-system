import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { listProductInventory } from "@/modules/catalog/data/catalog-queries";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";

export async function GET(request:Request){return executeApi(async()=>{await requirePosOperator();const productId=new URL(request.url).searchParams.get("product_id")??"";return listProductInventory(requireUuid(productId,"product_id"));});}
