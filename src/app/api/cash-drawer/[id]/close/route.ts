import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { closeCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { numberField,readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{const employee=await requirePosOperator();const body=await readJsonObject(request);const {id}=await params;return closeCashDrawer({employeeId:employee.employeeId,sessionId:id,actualClosingCash:numberField(body,"actual_closing_cash")});});}
