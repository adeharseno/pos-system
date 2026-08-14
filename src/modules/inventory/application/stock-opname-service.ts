import "server-only";

import { applyStockOpnameRpc, cancelStockOpnameRpc, startStockOpnameRpc } from "../data/stock-opname-rpc";
import { validateStartStockOpname, validateStockOpnameAction } from "../schemas";
import type { StartStockOpnameInput, StockOpnameActorInput } from "../types";

export const startStockOpname=(input:StartStockOpnameInput)=>startStockOpnameRpc(validateStartStockOpname(input));
export const applyStockOpname=(input:StockOpnameActorInput)=>applyStockOpnameRpc(validateStockOpnameAction(input));
export const cancelStockOpname=(input:StockOpnameActorInput)=>cancelStockOpnameRpc(validateStockOpnameAction(input));
