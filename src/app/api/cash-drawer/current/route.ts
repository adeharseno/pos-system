import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getCurrentCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(){return executeApi(async()=>{const employee=await requirePosOperator();return getCurrentCashDrawer(employee.employeeId);});}
