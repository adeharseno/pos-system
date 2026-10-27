import type { TransactionStatus } from "./transaction-history-filters";

// Presentation only. API/RPC authorization and lifecycle checks remain authoritative.
export function transactionActionVisibility(status: TransactionStatus, method: string, hasReturns: boolean) {
  return {
    confirm: status === "pending_payment" && method === "qris",
    void: !hasReturns && (status === "pending_payment" || (status === "completed" && method === "cash")),
  };
}
