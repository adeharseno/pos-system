import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { moneyCents } from "./invoice-input";

export type PurchaseHistoryFilters = { q: string; page: number; limit: number };

export function parsePurchaseHistoryFilters(input: Record<string, string | undefined>): PurchaseHistoryFilters {
  const raw = (input.q ?? "").trim();
  const q = raw.length <= 80 && !/[(),]/.test(raw) ? raw : "";
  const page = Number(input.page);
  return { q, page: Number.isSafeInteger(page) && page > 0 ? page : 1, limit: 20 };
}

export const purchaseHistoryRange = ({ page, limit }: PurchaseHistoryFilters) => ({ from: (page - 1) * limit, to: page * limit - 1 });

export function parsePurchasePayment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Data pembayaran tidak valid.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["request_id", "amount", "payment_date"].includes(key))) throw new PosInputError("Data pembayaran tidak valid.");
  const amount = moneyCents(body.amount);
  if (amount <= 0) throw new PosInputError("Jumlah pembayaran harus lebih dari nol.");
  const paymentDate = body.payment_date;
  if (typeof paymentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new PosInputError("Tanggal pembayaran tidak valid.");
  const date = new Date(`${paymentDate}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== paymentDate || paymentDate < "0001-01-01") throw new PosInputError("Tanggal pembayaran tidak valid.");
  return { requestId: requireUuid(typeof body.request_id === "string" ? body.request_id : "", "request_id"), amount: `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`, paymentDate };
}
