import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { openCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { numberField,readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
export async function POST(request:Request){return executeApi(async()=>{const employee=await requirePosOperator();const body=await readJsonObject(request);return openCashDrawer({employeeId:employee.employeeId,openingBalance:numberField(body,"opening_balance")});},201);}
