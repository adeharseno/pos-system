import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { listActiveProducts } from "@/modules/catalog/data/catalog-queries";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(){return executeApi(async()=>{await requirePosOperator();return listActiveProducts();});}
