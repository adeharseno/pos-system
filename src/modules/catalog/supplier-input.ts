import { PosInputError } from "@/modules/shared/validation/input";
export type SupplierInput = { name: string; phone: string | null; address: string | null };
export function parseSupplierInput(value: unknown): SupplierInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Data pemasok tidak valid.");
  const body = value as Record<string, unknown>;
  function text(key: string, label: string, max: number, required = false) {
    const raw = body[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw new PosInputError(label + " harus berupa teks.");
    const result = typeof raw === "string" ? raw.trim() : "";
    if (required && !result) throw new PosInputError(label + " wajib diisi.");
    if (result.length > max) throw new PosInputError(label + " terlalu panjang (maksimal " + max + " karakter).");
    return result || null;
  }
  return { name: text("name", "Nama pemasok", 200, true)!, phone: text("phone", "Nomor telepon", 50), address: text("address", "Alamat", 1000) };
}
