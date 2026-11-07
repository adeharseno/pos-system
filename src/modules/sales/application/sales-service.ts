import "server-only";

import { confirmManualPaymentRpc, checkoutRpc, voidTransactionRpc } from "../data/sales-rpc";
import { validateCheckoutInput, validateTransactionAction, validateVoidInput } from "../schemas";
import type { CheckoutInput, TransactionActionInput, VoidTransactionInput } from "../types";

export const checkout = (input: CheckoutInput) => checkoutRpc(validateCheckoutInput(input));
export const confirmManualPayment = (input: TransactionActionInput) => confirmManualPaymentRpc(validateTransactionAction(input));
export const voidTransaction = (input: VoidTransactionInput) => voidTransactionRpc(validateVoidInput(input));
