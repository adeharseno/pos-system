import type { TransactionStatus } from "./transaction-history-filters";

// Presentation only. API/RPC authorization and lifecycle checks remain authoritative.
export function transactionActionVisibility(status: TransactionStatus, method: string, hasReturns: boolean) {
  return {
    confirm: status === "pending_payment" && (method === "qris" || method === "bank_transfer"),
    void: !hasReturns && (status === "pending_payment" || (status === "completed" && method === "cash")),
  };
}

// A pending manual payment or TEMPO credit transaction must be printed as an invoice, never as a paid receipt.
export function transactionPrintLabel(status: TransactionStatus, method: string) {
  return method === "tempo" || (status === "pending_payment" && (method === "qris" || method === "bank_transfer"))
    ? "Cetak Invoice"
    : "Cetak Struk";
}
