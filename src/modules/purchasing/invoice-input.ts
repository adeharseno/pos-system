import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export const INVOICE_BUCKET = "purchase-invoices";
export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024;
export const PAYMENT_LABELS = { unpaid: "Belum Dibayar", partial: "Belum Lunas", paid: "Lunas" } as const;

export function moneyCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(value.trim())) throw new PosInputError("Jumlah uang tidak valid.");
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function paymentStatus(total: number, paid: number): keyof typeof PAYMENT_LABELS {
  return paid === 0 ? "unpaid" : paid < total ? "partial" : "paid";
}
const moneyText = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

export function parseInvoiceForm(form: FormData, editing: boolean) {
  const text = (key: string) => {
    const value = form.get(key);
    if (value !== null && typeof value !== "string") throw new PosInputError("Data invoice tidak valid.");
    return (value ?? "").trim();
  };
  const invoiceNumber = text("invoice_number");
  if (!invoiceNumber || invoiceNumber.length > 100) throw new PosInputError("Nomor invoice wajib diisi, maksimal 100 karakter.");
  const invoiceDate = text("invoice_date");
  const date = new Date(`${invoiceDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== invoiceDate || invoiceDate < "0001-01-01") throw new PosInputError("Tanggal invoice tidak valid.");
  const total = moneyCents(text("total_amount"));
  const paid = moneyCents(text("paid_amount") || "0");
  if (total <= 0 || paid > total) throw new PosInputError("Total harus positif dan pembayaran tidak boleh melebihi total.");
  const version = editing ? Number(text("version")) : null;
  if (editing && (!Number.isSafeInteger(version) || version! < 1)) throw new PosInputError("Versi invoice tidak valid.");
  return {
    id: requireUuid(text("id"), "invoice_id"), requestId: requireUuid(text("request_id"), "request_id"), version,
    payload: { supplier_id: requireUuid(text("supplier_id"), "supplier_id"), invoice_number: invoiceNumber,
      invoice_date: invoiceDate, total_amount: moneyText(total), paid_amount: moneyText(paid) },
  };
}

export function validateInvoiceFile(file: { name: string; size: number; type: string }, bytes: Uint8Array) {
  if (file.size <= 0 || file.size > MAX_INVOICE_FILE_BYTES || bytes.length !== file.size || !file.name.trim() || file.name.length > 200) throw new PosInputError("Dokumen maksimal 10 MB.");
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  let type: string;
  let extension: string;
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) { type = "application/pdf"; extension = "pdf"; }
  else if (starts(0xff, 0xd8, 0xff)) { type = "image/jpeg"; extension = "jpg"; }
  else if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) { type = "image/png"; extension = "png"; }
  else if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") { type = "image/webp"; extension = "webp"; }
  else throw new PosInputError("Gunakan foto JPG, PNG, WebP, atau PDF yang valid.");
  if (file.type !== type || !new RegExp(`\\.${extension === "jpg" ? "jpe?g" : extension}$`, "i").test(file.name)) throw new PosInputError("Jenis dan isi dokumen tidak sesuai.");
  return { type, extension };
}
