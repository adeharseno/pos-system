import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import type { StartStockOpnameInput, StockOpnameActorInput, UpdateStockOpnameItemInput } from "./types";

export function validateStartStockOpname(input: StartStockOpnameInput): StartStockOpnameInput {
  requireUuid(input.employeeId,"employeeId"); if(input.storageLocationId) requireUuid(input.storageLocationId,"storageLocationId"); return input;
}
export function validateStockOpnameAction(input: StockOpnameActorInput): StockOpnameActorInput {
  requireUuid(input.employeeId,"employeeId"); requireUuid(input.sessionId,"sessionId"); return input;
}
export function validateUpdateStockOpnameItem(input: UpdateStockOpnameItemInput): UpdateStockOpnameItemInput {
  requireUuid(input.sessionId, "sessionId");
  requireUuid(input.itemId, "itemId");
  if (!Number.isSafeInteger(input.physicalQuantity) || input.physicalQuantity < 0) {
    throw new PosInputError("physical_quantity must be a non-negative integer");
  }
  if (input.notes !== undefined && typeof input.notes !== "string") throw new PosInputError("notes must be a string");
  return { ...input, ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}) };
}
