import { requireNonBlank, requirePositiveInteger, requireUuid } from "@/modules/shared/validation/input";
import type { CustomerReturnInput, SupplierReturnInput } from "./types";

export function validateCustomerReturn(input: CustomerReturnInput): CustomerReturnInput {
  requireUuid(input.employeeId, "employeeId"); requireUuid(input.transactionId, "transactionId"); requireNonBlank(input.reason, "reason");
  if (!input.items.length) throw new TypeError("items must not be empty");
  if (input.refundMethod === "cash") requireUuid(input.cashDrawerSessionId ?? "", "cashDrawerSessionId");
  input.items.forEach((item, index) => { requireUuid(item.transactionItemId, `items[${index}].transactionItemId`); requirePositiveInteger(item.quantityInBase, `items[${index}].quantityInBase`); });
  return input;
}

export function validateSupplierReturn(input: SupplierReturnInput): SupplierReturnInput {
  requireUuid(input.employeeId, "employeeId"); requireNonBlank(input.reason, "reason");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => { requireUuid(item.productId, `items[${index}].productId`); requireUuid(item.batchId, `items[${index}].batchId`); requirePositiveInteger(item.quantityInBase, `items[${index}].quantityInBase`); });
  return input;
}
