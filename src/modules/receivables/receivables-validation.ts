import { requireUuid } from "@/modules/shared/validation/input";
import type { ReceivablePaymentMethod, RecordReceivablePaymentInput } from "./receivables-types";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_METHODS = new Set<ReceivablePaymentMethod>(["cash", "qris", "bank_transfer"]);

/** Validate and normalize a customer receivable payment recording payload. */
export function validateRecordReceivablePayment(
  input: RecordReceivablePaymentInput
): RecordReceivablePaymentInput {
  requireUuid(input.requestId, "requestId");
  requireUuid(input.employeeId, "employeeId");
  requireUuid(input.receivableId, "receivableId");

  if (!VALID_METHODS.has(input.paymentMethod)) {
    throw new TypeError("paymentMethod must be cash, qris, or bank_transfer");
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new TypeError("amount must be greater than zero");
  }
  const roundedAmount = Math.round(input.amount * 100) / 100;
  if (Math.abs(roundedAmount - input.amount) > 1e-6 || roundedAmount > 999_999_999_999.99) {
    throw new TypeError("amount has invalid precision or exceeds maximum");
  }

  const paymentDate = input.paymentDate.trim();
  if (!YMD_PATTERN.test(paymentDate)) {
    throw new TypeError("paymentDate must be YYYY-MM-DD");
  }
  const parsedDate = new Date(`${paymentDate}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== paymentDate) {
    throw new TypeError("paymentDate is not a valid calendar date");
  }

  const reference = input.reference?.trim() || null;
  if (reference && reference.length > 120) {
    throw new TypeError("reference must be at most 120 characters");
  }

  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) {
    throw new TypeError("notes must be at most 500 characters");
  }

  return {
    requestId: input.requestId,
    employeeId: input.employeeId,
    receivableId: input.receivableId,
    paymentMethod: input.paymentMethod,
    amount: roundedAmount,
    paymentDate,
    reference,
    notes,
  };
}

/** Validate client-side payment form amount against remaining balance. */
export function validateClientPaymentAmount(rawAmount: string, maxOutstanding: number): {
  valid: boolean;
  amount: number;
  error?: string;
} {
  const parsed = Number(rawAmount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, amount: 0, error: "Nominal pembayaran harus lebih dari Rp 0." };
  }
  const rounded = Math.round(parsed * 100) / 100;
  if (rounded > Math.round(maxOutstanding * 100) / 100) {
    return {
      valid: false,
      amount: rounded,
      error: "Nominal pembayaran tidak boleh melebihi sisa piutang.",
    };
  }
  return { valid: true, amount: rounded };
}

