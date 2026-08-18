import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { voidTransaction } from "@/modules/sales/application/sales-service";
import { readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{
  const employee=await requirePosOperator(); const body=await readJsonObject(request); const {id}=await params;
  return voidTransaction({employeeId:employee.employeeId,transactionId:id,reason:stringField(body,"reason")});
});}
