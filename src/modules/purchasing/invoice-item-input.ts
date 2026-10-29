import { PosInputError, requireUuid } from "@/modules/shared/validation/input";
import { formatMarginPercent, marginFromSellingPrice, sellingPriceFromCost } from "@/modules/catalog/product-pricing";
import { moneyCents } from "./invoice-input";

export type InvoiceProduct = {
  id: string; sku: string; name: string; baseUnit: string; costPrice: number | null; taxRate: number;
  previousExpiry: string | null;
  units: { id: string | null; name: string; conversion: number; sellingPrice: number | null }[];
};
export type ItemFields = { product_id: string; product_unit_id: string | null; cost_price: string; tax_rate: string; margin_percent: string; selling_price: string; pricing_mode: "margin" | "selling_price"; quantity: string; batch_number: string; expired_date: string; expiry_confirmed: boolean };
export const blankItemFields = (): ItemFields => ({ product_id: "", product_unit_id: null, cost_price: "", tax_rate: "", margin_percent: "", selling_price: "", pricing_mode: "selling_price", quantity: "", batch_number: "", expired_date: "", expiry_confirmed: false });
export function fieldsForProduct(product: InvoiceProduct, unitId: string | null): ItemFields {
  const unit = product.units.find(unit => unit.id === unitId);
  if (!unit) throw new PosInputError("Satuan tidak tersedia.");
  const cost = product.costPrice === null ? null : product.costPrice * unit.conversion;
  const margin = marginFromSellingPrice(cost ?? NaN, product.taxRate, unit.sellingPrice ?? NaN);
  return { ...blankItemFields(), product_id: product.id, product_unit_id: unitId, cost_price: cost === null ? "" : String(Math.round(cost * 100) / 100), tax_rate: String(product.taxRate), selling_price: unit.sellingPrice === null ? "" : String(unit.sellingPrice), margin_percent: margin === null ? "" : formatMarginPercent(margin) };
}
export function changeItemPrice(fields: ItemFields, key: "cost_price" | "tax_rate" | "margin_percent" | "selling_price", value: string): ItemFields {
  const next = { ...fields, [key]: value };
  if (key === "margin_percent") next.pricing_mode = "margin";
  if (key === "selling_price") next.pricing_mode = "selling_price";
  const numeric = (text: string) => text.trim() === "" ? NaN : Number(text);
  if (next.pricing_mode === "margin") {
    const price = sellingPriceFromCost(numeric(next.cost_price), numeric(next.tax_rate), numeric(next.margin_percent));
    if (price !== null) next.selling_price = String(price);
  } else {
    const margin = marginFromSellingPrice(numeric(next.cost_price), numeric(next.tax_rate), numeric(next.selling_price));
    next.margin_percent = margin === null ? "" : formatMarginPercent(margin);
  }
  return next;
}

export function parseInvoiceItem(value: unknown, businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Data barang tidak valid.");
  const body = value as Record<string, unknown>;
  const text = (key: string) => typeof body[key] === "string" ? (body[key] as string).trim() : "";
  const cost = moneyCents(text("cost_price")) / 100;
  const tax = moneyCents(text("tax_rate")) / 100;
  if (tax > 100) throw new PosInputError("Pajak harus 0 sampai 100 persen.");
  const quantity = Number(text("quantity"));
  if (!/^\d+$/.test(text("quantity")) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) throw new PosInputError("Jumlah harus bilangan bulat lebih dari 0.");
  const batch = text("batch_number");
  if (!batch || batch.length > 100) throw new PosInputError("Nomor batch wajib diisi, maksimal 100 karakter.");
  const expiry = text("expired_date");
  const date = new Date(`${expiry}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== expiry || expiry < businessDate || body.expiry_confirmed !== true) throw new PosInputError("Isi tanggal kedaluwarsa yang valid dan konfirmasi ulang sesuai kemasan.");
  const mode = body.pricing_mode;
  if (mode !== "margin" && mode !== "selling_price") throw new PosInputError("Perhitungan harga tidak valid.");
  let selling: number;
  let margin: number | null;
  if (mode === "margin") {
    if (!/^\d{1,19}(\.\d{1,6})?$/.test(text("margin_percent"))) throw new PosInputError("Margin tidak valid.");
    margin = Number(text("margin_percent"));
    const result = sellingPriceFromCost(cost, tax, margin);
    if (result === null || margin > 1e18) throw new PosInputError("Margin tidak valid.");
    selling = result;
    moneyCents(selling.toFixed(2));
  } else {
    selling = moneyCents(text("selling_price")) / 100;
    margin = marginFromSellingPrice(cost, tax, selling);
  }
  const productUnitId = body.product_unit_id === null ? null : requireUuid(text("product_unit_id"), "product_unit_id");
  return { product_id: requireUuid(text("product_id"), "product_id"), product_unit_id: productUnitId,
    cost_price: cost.toFixed(2), tax_rate: tax.toFixed(2), margin_percent: margin === null ? null : String(margin), selling_price: selling.toFixed(2), pricing_mode: mode,
    quantity: String(quantity), batch_number: batch, expired_date: expiry };
}

export function itemSubtotalCents(cost: string, quantity: string, tax: string): bigint {
  const costCents = BigInt(moneyCents(cost));
  const taxBasis = BigInt(moneyCents(tax));
  if (!/^\d+$/.test(quantity)) throw new PosInputError("Jumlah tidak valid.");
  return (costCents * BigInt(quantity) * (BigInt(10000) + taxBasis) + BigInt(5000)) / BigInt(10000);
}
export function formatItemCents(cents: bigint) {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}Rp ${(absolute / BigInt(100)).toLocaleString("id-ID")}${absolute % BigInt(100) ? `,${String(absolute % BigInt(100)).padStart(2, "0")}` : ""}`;
}
