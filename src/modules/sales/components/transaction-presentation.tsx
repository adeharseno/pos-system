import type { TransactionStatus } from "../transaction-history-filters";
import { historyStatusLabel } from "../transaction-history-filters";

export const transactionLinkClass = "inline-flex min-h-13 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-800 transition hover:bg-gray-50";

export function paymentLabel(method: string) {
  return method === "cash" ? "Tunai" : method === "qris" ? "QRIS" : method === "bank_transfer" ? "Transfer Bank" : "Tidak diketahui";
}

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const tones = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pending_payment: "border-amber-200 bg-amber-50 text-amber-900",
    voided: "border-red-200 bg-red-50 text-red-800",
  };
  return <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${tones[status]}`}>{historyStatusLabel(status)}</span>;
}
