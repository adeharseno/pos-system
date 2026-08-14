import { requireNonBlank, requireNonNegativeMoney, requirePositiveInteger, requireUuid } from "@/modules/shared/validation/input";
import type { CheckoutInput, TransactionActionInput, VoidTransactionInput } from "./types";

export function validateCheckoutInput(input: CheckoutInput): CheckoutInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.cashDrawerSessionId, "cashDrawerSessionId");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => {
    requireUuid(item.productUnitId, `items[${index}].productUnitId`);
    requirePositiveInteger(item.quantity, `items[${index}].quantity`);
  });
  if (input.cashReceived !== undefined) requireNonNegativeMoney(input.cashReceived, "cashReceived");
  if (input.prescription) {
    requireNonBlank(input.prescription.doctorName, "prescription.doctorName");
    requireNonBlank(input.prescription.patientName, "prescription.patientName");
  }
  return input;
}

export function validateTransactionAction(input: TransactionActionInput): TransactionActionInput {
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.transactionId, "transactionId");
  return input;
}

export function validateVoidInput(input: VoidTransactionInput): VoidTransactionInput {
  validateTransactionAction(input);
  requireNonBlank(input.reason, "reason");
  return input;
}
