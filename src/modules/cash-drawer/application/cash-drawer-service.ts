import "server-only";
import { getOpenCashDrawer } from "../data/cash-drawer-queries";
import { closeCashDrawerRpc,openCashDrawerRpc } from "../data/cash-drawer-rpc";
import { validateCloseCashDrawer,validateOpenCashDrawer } from "../schemas";
import type { CloseCashDrawerInput,OpenCashDrawerInput } from "../types";
export const openCashDrawer=(input:OpenCashDrawerInput)=>openCashDrawerRpc(validateOpenCashDrawer(input));
export const closeCashDrawer=(input:CloseCashDrawerInput)=>closeCashDrawerRpc(validateCloseCashDrawer(input));
export const getCurrentCashDrawer=(employeeId:string)=>getOpenCashDrawer(employeeId);
