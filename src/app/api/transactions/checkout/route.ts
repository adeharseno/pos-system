import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getCurrentCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { checkout } from "@/modules/sales/application/sales-service";
import { checkoutInputFromBody } from "@/modules/sales/checkout-request";
import { readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";

export async function POST(request:Request){return executeApi(async()=>{
  const employee=await requirePosOperator();const drawer=await getCurrentCashDrawer(employee.employeeId);if(!drawer)throw new PosDomainError("NO_ACTIVE_CASH_DRAWER");const body=await readJsonObject(request);
  const input=checkoutInputFromBody(body,employee.employeeId,drawer.id);const result=await checkout(input);return{...result,cashReceived:input.cashReceived??0};
},201);}
