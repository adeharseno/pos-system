import "server-only";

import { getActiveStockOpnameSession, getStockOpnameSession, updateStockOpnameItem as updateStockOpnameItemRecord } from "../data/stock-opname-repository";
import { applyStockOpnameRpc, cancelStockOpnameRpc, startStockOpnameRpc } from "../data/stock-opname-rpc";
import { validateStartStockOpname, validateStockOpnameAction, validateUpdateStockOpnameItem } from "../schemas";
import type { StartStockOpnameInput, StockOpnameActorInput, UpdateStockOpnameItemInput } from "../types";
import { requireUuid } from "@/modules/shared/validation/input";

export const startStockOpname=(input:StartStockOpnameInput)=>startStockOpnameRpc(validateStartStockOpname(input));
export const applyStockOpname=(input:StockOpnameActorInput)=>applyStockOpnameRpc(validateStockOpnameAction(input));
export const cancelStockOpname=(input:StockOpnameActorInput)=>cancelStockOpnameRpc(validateStockOpnameAction(input));
export const getActiveStockOpname=()=>getActiveStockOpnameSession();
export const getStockOpname=(sessionId:string)=>getStockOpnameSession(requireUuid(sessionId, "sessionId"));
export const updateStockOpnameItem=(input:UpdateStockOpnameItemInput)=>updateStockOpnameItemRecord(validateUpdateStockOpnameItem(input));
