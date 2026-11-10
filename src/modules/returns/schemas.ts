import { requireNonBlank, requirePositiveInteger, requireUuid } from "@/modules/shared/validation/input";
import type {
  ApproveReturnInput,
  CompleteReturnInput,
  CustomerReturnInput,
  CustomerReturnRequestInput,
  RejectReturnInput,
  SupplierReturnInput,
} from "./types";

export function validateCustomerReturn(input: CustomerReturnInput): CustomerReturnInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.transactionId, "transactionId");
  requireNonBlank(input.reason, "reason");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => {
    requireUuid(item.transactionItemId, `items[${index}].transactionItemId`);
    requirePositiveInteger(item.quantityInBase, `items[${index}].quantityInBase`);
  });
  return input;
}

export function validateCustomerReturnRequest(input: CustomerReturnRequestInput): CustomerReturnRequestInput {
  return validateCustomerReturn(input);
}

export function validateApproveReturn(input: ApproveReturnInput): ApproveReturnInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.returnId, "returnId");
  requireNonBlank(input.adminNotes, "adminNotes");
  if (input.itemConditions?.length) {
    input.itemConditions.forEach((item, index) => {
      requireUuid(item.returnItemId, `itemConditions[${index}].returnItemId`);
      if (!["good", "damaged", "expired"].includes(item.condition)) {
        throw new TypeError(`invalid condition: ${item.condition}`);
      }
    });
  }
  return input;
}

export function validateRejectReturn(input: RejectReturnInput): RejectReturnInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.returnId, "returnId");
  requireNonBlank(input.adminNotes, "adminNotes");
  return input;
}

export function validateCompleteReturn(input: CompleteReturnInput): CompleteReturnInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.returnId, "returnId");
  if (input.itemConditions?.length) {
    input.itemConditions.forEach((item, index) => {
      requireUuid(item.returnItemId, `itemConditions[${index}].returnItemId`);
      if (!["good", "damaged", "expired"].includes(item.condition)) {
        throw new TypeError(`invalid condition: ${item.condition}`);
      }
    });
  }
  return input;
}

export function validateSupplierReturn(input: SupplierReturnInput): SupplierReturnInput {
  requireUuid(input.employeeId, "employeeId");
  requireNonBlank(input.reason, "reason");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => {
    requireUuid(item.productId, `items[${index}].productId`);
    requireUuid(item.batchId, `items[${index}].batchId`);
    requirePositiveInteger(item.quantityInBase, `items[${index}].quantityInBase`);
  });
  return input;
}
