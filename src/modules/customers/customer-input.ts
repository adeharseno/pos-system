import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export type CustomerInput = {
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export function parseCustomerInput(value: unknown): CustomerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PosInputError("Data pelanggan tidak valid.");
  }
  const body = value as Record<string, unknown>;

  function text(key: string, label: string, max: number, required = false) {
    const raw = body[key];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      throw new PosInputError(`${label} harus berupa teks.`);
    }
    const result = typeof raw === "string" ? raw.trim() : "";
    if (required && !result) {
      throw new PosInputError(`${label} wajib diisi.`);
    }
    if (result.length > max) {
      throw new PosInputError(`${label} terlalu panjang (maksimal ${max} karakter).`);
    }
    return result || null;
  }

  return {
    name: text("name", "Nama pelanggan", 200, true)!,
    phone: text("phone", "Nomor telepon", 50),
    address: text("address", "Alamat", 1000),
    notes: text("notes", "Catatan", 1000),
  };
}

export function parseCustomerCreateBody(value: unknown): CustomerInput & { requestId: string } {
  const input = parseCustomerInput(value);
  const body = value as Record<string, unknown>;
  const rawRequestId = body.request_id;
  const requestId =
    typeof rawRequestId === "string" && rawRequestId.trim()
      ? requireUuid(rawRequestId.trim(), "request_id")
      : crypto.randomUUID();
  return { ...input, requestId };
}

