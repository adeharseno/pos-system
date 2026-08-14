import { requireUuid } from "@/modules/shared/validation/input";
import type { StartStockOpnameInput, StockOpnameActorInput } from "./types";

export function validateStartStockOpname(input: StartStockOpnameInput): StartStockOpnameInput {
  requireUuid(input.employeeId,"employeeId"); if(input.storageLocationId) requireUuid(input.storageLocationId,"storageLocationId"); return input;
}
export function validateStockOpnameAction(input: StockOpnameActorInput): StockOpnameActorInput {
  requireUuid(input.employeeId,"employeeId"); requireUuid(input.sessionId,"sessionId"); return input;
}
