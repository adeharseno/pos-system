import "server-only";

import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import { toCheckoutRpcArgs } from "../rpc-contract";
import type { CheckoutInput, CheckoutResult, TransactionActionInput, TransactionStatusResult, VoidTransactionInput } from "../types";

export async function checkoutRpc(input: CheckoutInput): Promise<CheckoutResult> {
  const data = requireResultObject(await callCoreRpc("checkout_transaction", toCheckoutRpcArgs(input)));
  return {
    transactionId: resultString(data, "transaction_id"), invoiceNumber: resultString(data, "invoice_number"),
    status: resultString(data, "status") as CheckoutResult["status"], subtotal: resultNumber(data, "subtotal"),
    taxAmount: resultNumber(data, "tax_amount"), totalAmount: resultNumber(data, "total_amount"),
    cashChange: typeof data.cash_change === "number" ? data.cash_change : null,
  };
}

export async function confirmQrisRpc(input: TransactionActionInput): Promise<TransactionStatusResult> {
  const data = requireResultObject(await callCoreRpc("confirm_qris_payment", { p_employee_id: input.employeeId, p_transaction_id: input.transactionId }));
  return { transactionId: resultString(data, "transaction_id"), status: resultString(data, "status") as "completed" };
}

export async function voidTransactionRpc(input: VoidTransactionInput): Promise<TransactionStatusResult> {
  const data = requireResultObject(await callCoreRpc("void_transaction", { p_employee_id: input.employeeId, p_transaction_id: input.transactionId, p_reason: input.reason.trim() }));
  return { transactionId: resultString(data, "transaction_id"), status: resultString(data, "status") as "voided" };
}
