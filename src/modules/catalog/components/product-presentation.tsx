export const productLinkClass = "inline-flex min-h-13 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-800 transition hover:bg-gray-50";
export const productPrimaryLinkClass = "inline-flex min-h-13 items-center justify-center rounded-lg border border-transparent bg-brand-500 px-5 py-3 text-base font-medium text-white transition hover:bg-brand-600";

export function ProductStatus({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-gray-100 text-gray-700"}`}>{active ? "Aktif" : "Nonaktif"}</span>;
}

export function StockValue({ quantity, unit }: { quantity: number; unit: string }) {
  return <div><p className="break-words text-base font-semibold text-gray-900 tabular">{quantity.toLocaleString("id-ID")} {unit}</p>{quantity === 0 ? <p className="mt-1 text-sm font-medium text-red-800">Stok habis</p> : null}</div>;
}

export function hasDisplayValue(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && value.trim() !== "—");
}
