import { PAYMENT_LABELS, paymentStatus } from "../invoice-input";

export function PaymentStatusBadge({ totalCents, paidCents }: { totalCents: number; paidCents: number }) {
  const status = paymentStatus(totalCents, paidCents);
  const colors = status === "paid" ? "bg-emerald-50 text-emerald-700" : status === "partial" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${colors}`}>{PAYMENT_LABELS[status]}</span>;
}
