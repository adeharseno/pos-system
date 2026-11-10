import { requireNonBlank, requireNonNegativeMoney, requirePositiveInteger, requireUuid } from "@/modules/shared/validation/input";
import { DEFAULT_PRESCRIPTION_CATEGORY, type CheckoutInput, type TransactionActionInput, type VoidTransactionInput } from "./types";

export function validateCheckoutInput(input: CheckoutInput): CheckoutInput {
  const normalized = input.prescription ? input : { ...input, prescription: { category: DEFAULT_PRESCRIPTION_CATEGORY } };
  requireUuid(input.requestId, "requestId");
  requireUuid(input.employeeId, "employeeId");
  if (!input.items.length) throw new TypeError("items must not be empty");
  input.items.forEach((item, index) => {
    requireUuid(item.productUnitId, `items[${index}].productUnitId`);
    requirePositiveInteger(item.quantity, `items[${index}].quantity`);
  });
  if (input.cashReceived !== undefined) requireNonNegativeMoney(input.cashReceived, "cashReceived");
  if (!normalized.prescription || !["umum","bpjs","bebas"].includes(normalized.prescription.category)) throw new TypeError("prescription category is required");
  if ((normalized.prescription.category === "bpjs") !== (input.paymentMethod === "bpjs")) throw new TypeError("payment method does not match prescription category");
  if (input.paymentMethod === "bpjs" && input.cashReceived !== 0) throw new TypeError("BPJS cash received must be zero");
  if (normalized.prescription.category === "bpjs") requireNonBlank(normalized.prescription.bpjsNumber ?? "", "prescription.bpjsNumber");
  if (normalized.prescription.prescriptionDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.prescription.prescriptionDate)) throw new TypeError("invalid prescription date");
  if (input.supplementaryItems?.length) {
    if (input.paymentMethod !== "bpjs") throw new TypeError("supplementary items only allowed for BPJS");
    input.supplementaryItems.forEach((item, index) => {
      requireNonBlank(item.drugName, `supplementaryItems[${index}].drugName`);
      requirePositiveInteger(item.quantity, `supplementaryItems[${index}].quantity`);
      requireNonNegativeMoney(item.unitPrice, `supplementaryItems[${index}].unitPrice`);
    });
  }
  return normalized;
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
