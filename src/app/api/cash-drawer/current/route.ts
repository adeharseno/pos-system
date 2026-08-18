import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getOpenCashDrawer } from "@/modules/cash-drawer/data/cash-drawer-queries";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(){return executeApi(async()=>{const employee=await requirePosOperator();return getOpenCashDrawer(employee.employeeId);});}
