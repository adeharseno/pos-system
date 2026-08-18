import { requireRole } from "@/modules/auth/application/auth-service";
import { startStockOpname } from "@/modules/inventory/application/stock-opname-service";
import { optionalStringField, readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request:Request){return executeApi(async()=>{
  const employee=await requireRole(["owner_admin"]); const body=await readJsonObject(request);
  return startStockOpname({employeeId:employee.employeeId,storageLocationId:optionalStringField(body,"storage_location_id")});
},201);}
