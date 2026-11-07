import { requireOwnerPermission } from "@/modules/auth/application/auth-service";
import { confirmManualPayment } from "@/modules/sales/application/sales-service";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{
  const employee=await requireOwnerPermission("transactions.confirm_payment"); const {id}=await params;
  return confirmManualPayment({employeeId:employee.employeeId,transactionId:id});
});}
