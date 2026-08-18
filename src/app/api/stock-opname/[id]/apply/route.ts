import { requireRole } from "@/modules/auth/application/auth-service";
import { applyStockOpname } from "@/modules/inventory/application/stock-opname-service";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{
  const employee=await requireRole(["owner_admin"]); const {id}=await params;
  return applyStockOpname({employeeId:employee.employeeId,sessionId:id});
});}
