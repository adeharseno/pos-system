import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { checkout } from "@/modules/sales/application/sales-service";
import { checkoutInputFromBody } from "@/modules/sales/checkout-request";
import { readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request:Request){return executeApi(async()=>{
  const employee=await requirePosOperator();const body=await readJsonObject(request);
  const input=checkoutInputFromBody(body,employee.employeeId);const result=await checkout(input);return{...result,cashReceived:input.cashReceived??0};
},201);}
