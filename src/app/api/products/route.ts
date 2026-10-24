import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { findCashierProductByBarcode,searchCashierProducts } from "@/modules/catalog/data/catalog-queries";
import { parseBarcode,parseProductSearchQuery } from "@/modules/catalog/search";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(request:Request){return executeApi(async()=>{await requirePosOperator();const params=new URL(request.url).searchParams;const rawBarcode=params.get("barcode");if(rawBarcode!==null)return findCashierProductByBarcode(parseBarcode(rawBarcode));const query=parseProductSearchQuery(params.get("q"));return searchCashierProducts(query);});}
