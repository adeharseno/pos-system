import { requireAllPermissions } from "@/modules/auth/application/auth-service";
import { getCashierProductAvailability } from "@/modules/catalog/data/catalog-queries";
import { executeApi } from "@/modules/shared/api/response";
import { requireUuid } from "@/modules/shared/validation/input";

export async function GET(request:Request){return executeApi(async()=>{
  await requireAllPermissions(["cashier.view","sales.checkout"]);
  const values=[...new Set((new URL(request.url).searchParams.get("ids")??"").split(",").filter(Boolean))];
  if(!values.length||values.length>100)throw new TypeError("invalid product ids");
  return getCashierProductAvailability(values.map((value,index)=>requireUuid(value,`ids[${index}]`)));
});}
