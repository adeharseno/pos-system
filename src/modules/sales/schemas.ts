import { requireNonBlank, requireNonNegativeMoney, requirePositiveInteger, requireUuid } from "@/modules/shared/validation/input";
import type { CheckoutInput, TransactionActionInput, VoidTransactionInput } from "./types";

export function validateCheckoutInput(input: CheckoutInput): CheckoutInput {
  requireUuid(input.employeeId, "employeeId");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => {
    requireUuid(item.productUnitId, `items[${index}].productUnitId`);
    requirePositiveInteger(item.quantity, `items[${index}].quantity`);
  });
  if (input.cashReceived !== undefined) requireNonNegativeMoney(input.cashReceived, "cashReceived");
  if (!input.prescription || !["umum","bpjs"].includes(input.prescription.category)) throw new TypeError("prescription category is required");
  if (input.prescription.category === "bpjs") requireNonBlank(input.prescription.bpjsNumber ?? "", "prescription.bpjsNumber");
  if (input.prescription.prescriptionDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.prescription.prescriptionDate)) throw new TypeError("invalid prescription date");
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
