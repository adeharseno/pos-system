import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { searchCashierProducts } from "@/modules/catalog/data/catalog-queries";
import { parseProductSearchQuery } from "@/modules/catalog/search";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(request:Request){return executeApi(async()=>{await requirePosOperator();const query=parseProductSearchQuery(new URL(request.url).searchParams.get("q"));return searchCashierProducts(query);});}
