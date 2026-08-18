import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { confirmQrisPayment } from "@/modules/sales/application/sales-service";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{
  const employee=await requirePosOperator(); const {id}=await params;
  return confirmQrisPayment({employeeId:employee.employeeId,transactionId:id});
});}
