import { formatItemCents } from "./invoice-item-input";
export function formatReceivingAmount(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return "Belum tersedia";
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return formatItemCents(value.startsWith("-") ? -cents : cents);
}
