import "server-only";

import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultString } from "@/modules/shared/data/result";
import type { StartStockOpnameInput, StockOpnameActorInput, StockOpnameResult } from "../types";

function mapResult(data: Awaited<ReturnType<typeof callCoreRpc>>): StockOpnameResult {
  const result=requireResultObject(data); const itemCount=result.item_count;
  return {sessionId:resultString(result,"session_id"),status:resultString(result,"status") as StockOpnameResult["status"],itemCount:typeof itemCount==="number"?itemCount:undefined};
}
export async function startStockOpnameRpc(input:StartStockOpnameInput){return mapResult(await callCoreRpc("start_stock_opname",{p_employee_id:input.employeeId,p_storage_location_id:input.storageLocationId}));}
export async function applyStockOpnameRpc(input:StockOpnameActorInput){return mapResult(await callCoreRpc("apply_stock_opname",{p_employee_id:input.employeeId,p_session_id:input.sessionId}));}
export async function cancelStockOpnameRpc(input:StockOpnameActorInput){return mapResult(await callCoreRpc("cancel_stock_opname",{p_employee_id:input.employeeId,p_session_id:input.sessionId}));}
