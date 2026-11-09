export type TransactionStatus = "pending_payment" | "completed" | "voided" | "incomplete_fulfillment";
export type PaymentMethod = "cash" | "qris" | "bank_transfer" | "bpjs";
export type HistoryFilters = {
  q: string;
  payment?: PaymentMethod;
  status?: TransactionStatus;
  from?: string;
  to?: string;
  cashierId?: string;
  page: number;
  limit: number;
};

const date = /^\d{4}-\d{2}-\d{2}$/;
const uuid = /^[0-9a-fA-F-]{36}$/;

const values = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === "string" && allowed.includes(value as T) ? (value as T) : undefined;

export function parseHistoryFilters(input: Record<string, unknown>): HistoryFilters {
  const page =
    typeof input.page === "string" && /^\d+$/.test(input.page)
      ? Math.max(1, Math.min(Number(input.page), 10000))
      : 1;
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 80) : "";
  return {
    q,
    payment: values(input.payment, ["cash", "qris", "bank_transfer", "bpjs"]),
    status: values(input.status, ["pending_payment", "completed", "voided", "incomplete_fulfillment"]),
    from: typeof input.from === "string" && date.test(input.from) ? input.from : undefined,
    to: typeof input.to === "string" && date.test(input.to) ? input.to : undefined,
    cashierId:
      typeof input.cashier === "string" && uuid.test(input.cashier) ? input.cashier : undefined,
    page,
    limit: 20,
  };
}

export const historyStatusLabel = (status: TransactionStatus) =>
  status === "completed"
    ? "Selesai"
    : status === "incomplete_fulfillment"
      ? "Barang Belum Lengkap"
      : status === "pending_payment"
        ? "Menunggu Pembayaran"
        : "Dibatalkan";

export function resolveTransactionDisplayStatus(
  financialStatus: string,
  paymentMethod: string,
  hasPendingFulfillment: boolean
): TransactionStatus {
  if (financialStatus === "voided") return "voided";
  if (financialStatus === "pending_payment") return "pending_payment";
  if (paymentMethod === "bpjs" && hasPendingFulfillment) {
    return "incomplete_fulfillment";
  }
  return "completed";
}

/** Jakarta-today as a plain YYYY-MM-DD string, safe for URL filters. */
export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
