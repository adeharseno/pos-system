"use client";

import { useMemo, useState } from "react";
import type { ProductImportMasterData, ProductImportPreviewRow } from "../application/preview-product-import";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label, Select } from "@/modules/ui/components";

type ApiResponse = { ok: boolean; data?: { rows: ProductImportPreviewRow[] }; error?: { message?: string } };
type CommitResult = { row: number; sku: string; status: "success" | "failed"; product_id?: string; error?: { code: string; message: string } };
type CommitResponse = { ok: boolean; data?: { results: CommitResult[] }; error?: { message?: string } };
type MappingField = "categoryId" | "subcategoryId" | "defaultSupplierId" | "storageLocationId";

const classificationLabel = (value: string) => value === "otc" ? "Bebas" : value === "otc_limited" ? "Bebas terbatas" : value === "prescription_required" ? "Wajib resep" : value;

function mappedRows(rows: ProductImportPreviewRow[], master: ProductImportMasterData, clearedOptional: Set<string>) {
  return rows.map((row) => {
    const errors = [...row.baseErrors];
    const category = master.categories.find((item) => item.id === row.categoryId);
    const subcategory = master.subcategories.find((item) => item.id === row.subcategoryId);
    if (row.category && !category) errors.push("Kategori tidak ditemukan pada data acuan.");
    if (row.subcategory && !subcategory) errors.push("Subkategori tidak ditemukan pada data acuan.");
    if (category && subcategory && subcategory.category_id !== category.id) errors.push("Subkategori tidak sesuai dengan kategori.");
    if (row.supplier && !master.suppliers.some((item) => item.id === row.defaultSupplierId) && !clearedOptional.has(`supplier:${row.supplier}`)) errors.push("Pemasok tidak ditemukan pada data acuan.");
    if (row.storageLocation && !master.locations.some((item) => item.id === row.storageLocationId) && !clearedOptional.has(`storageLocation:${row.storageLocation}`)) errors.push("Lokasi penyimpanan tidak ditemukan pada data acuan.");
    return { ...row, valid: errors.length === 0, errors };
  });
}

function uniqueValues(rows: ProductImportPreviewRow[], field: "category" | "subcategory" | "supplier" | "storageLocation") {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))];
}

export function ProductImportPreview({ master }: { master: ProductImportMasterData }) {
  const [rawRows, setRawRows] = useState<ProductImportPreviewRow[]>([]);
  const [clearedOptional, setClearedOptional] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CommitResult[]>([]);
  const rows = useMemo(() => mappedRows(rawRows, master, clearedOptional), [rawRows, master, clearedOptional]);
  const canCommit = rows.length > 0 && rows.every((row) => row.valid);

  function mapValue(field: MappingField, source: "category" | "subcategory" | "supplier" | "storageLocation", value: string, id: string | null) {
    setRawRows((current) => current.map((row) => row[source] === value ? { ...row, [field]: id } : row));
    if (source === "supplier" || source === "storageLocation") {
      const key = `${source}:${value}`;
      setClearedOptional((current) => { const next = new Set(current); if (id === null) next.add(key); else next.delete(key); return next; });
    }
  }

  async function preview(form: FormData) {
    if (busy) return; setBusy(true); setError(""); setResults([]);
    try { const response = await fetch("/api/products/import/preview", { method: "POST", body: form }); const body = await response.json() as ApiResponse; if (!response.ok || !body.ok) { setRawRows([]); setClearedOptional(new Set()); setError(body.error?.message ?? "Berkas gagal diproses."); return; } setRawRows(body.data?.rows ?? []); setClearedOptional(new Set()); } catch { setRawRows([]); setClearedOptional(new Set()); setError("Berkas gagal diproses."); } finally { setBusy(false); }
  }

  async function commit() {
    if (busy || !canCommit) return; setBusy(true); setError(""); setResults([]);
    const payload = rows.map((row) => ({ rowNumber: row.rowNumber, sku: row.sku, name: row.name, genericName: row.genericName, manufacturer: row.manufacturer, baseUnit: row.baseUnit, sellingPrice: Number(row.sellingPrice), costPrice: row.costPrice === "" ? 0 : Number(row.costPrice), barcode: row.barcode, drugClassification: row.drugClassification, minimumStock: row.minimumStock === "" ? 0 : Number(row.minimumStock), categoryId: row.categoryId, subcategoryId: row.subcategoryId, defaultSupplierId: row.defaultSupplierId, storageLocationId: row.storageLocationId }));
    try { const response = await fetch("/api/products/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: payload }) }); const body = await response.json() as CommitResponse; if (!response.ok || !body.ok) { setError(body.error?.message ?? "Impor produk gagal."); return; } setResults(body.data?.results ?? []); } catch { setError("Impor produk gagal."); } finally { setBusy(false); }
  }

  const mappingSelect = (field: MappingField, source: "category" | "subcategory" | "supplier" | "storageLocation", value: string, options: { id: string; name?: string; full_code?: string }[], optional = false) => {
    const selected = rows.find((row) => row[source] === value)?.[field] as string | null | undefined;
    const state = optional && !clearedOptional.has(`${source}:${value}`) && !selected ? "__unmapped__" : selected ?? "";
    return <FormField key={`${source}-${value}`}><Label>{source === "storageLocation" ? "Lokasi unggahan" : `${source === "supplier" ? "Pemasok" : source === "category" ? "Kategori" : "Subkategori"} unggahan`}: <strong>{value}</strong></Label><Select value={state} onChange={(event) => mapValue(field, source, value, event.target.value || null)}>{optional ? <><option value="__unmapped__" disabled>Pilih pemetaan atau kosongkan</option><option value="">Kosongkan pemetaan</option></> : <option value="">Pilih pemetaan</option>}{options.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.full_code}</option>)}</Select></FormField>;
  };

  return <section className="mt-5 grid gap-5"><Card><CardHeader><h2 className="font-semibold">Unggah Berkas</h2></CardHeader><CardContent><form action={preview} className="grid gap-4"><FormField><Label htmlFor="file">Berkas .xlsx atau .csv</Label><Input id="file" required name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></FormField><p className="text-sm text-[var(--text-muted)]">Maksimum 5 MB. Data hanya ditampilkan untuk pemeriksaan dan belum disimpan.</p>{error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="submit" disabled={busy}>{busy ? "Memproses…" : "Periksa Berkas"}</Button></FormActions></form></CardContent></Card>
    {rows.length > 0 ? <><Card><CardHeader><h2 className="font-semibold">Pemetaan data acuan</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Satu pemetaan diterapkan ke semua baris dengan nilai unggahan yang sama.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{uniqueValues(rows, "category").map((value) => mappingSelect("categoryId", "category", value, master.categories))}{uniqueValues(rows, "subcategory").map((value) => mappingSelect("subcategoryId", "subcategory", value, master.subcategories))}{uniqueValues(rows, "supplier").map((value) => mappingSelect("defaultSupplierId", "supplier", value, master.suppliers, true))}{uniqueValues(rows, "storageLocation").map((value) => mappingSelect("storageLocationId", "storageLocation", value, master.locations, true))}</CardContent></Card>
      <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr>{["Baris","Status","SKU","Nama Produk","Nama Generik","Produsen","Kategori","Subkategori","Unit Dasar","Harga Jual","Harga Modal","Barcode","Klasifikasi","Minimum Stok","Pemasok","Lokasi Penyimpanan","Kesalahan"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t border-[var(--border)]"><td className="p-3">{row.rowNumber}</td><td className="p-3">{row.valid ? "Valid" : "Tidak valid"}</td><td className="p-3">{row.sku}</td><td className="p-3">{row.name}</td><td className="p-3">{row.genericName}</td><td className="p-3">{row.manufacturer}</td><td className="p-3">{row.category}</td><td className="p-3">{row.subcategory}</td><td className="p-3">{row.baseUnit}</td><td className="p-3">{row.sellingPrice}</td><td className="p-3">{row.costPrice}</td><td className="p-3">{row.barcode}</td><td className="p-3">{classificationLabel(row.drugClassification)}</td><td className="p-3">{row.minimumStock}</td><td className="p-3">{row.supplier}</td><td className="p-3">{row.storageLocation}</td><td className="p-3">{row.errors.join(" ")}</td></tr>)}</tbody></table></div></Card>
      <Card><CardContent><p className="text-sm text-[var(--text-muted)]">{canCommit ? "Semua baris valid dan siap diimpor." : "Perbaiki semua baris tidak valid sebelum impor."}</p><FormActions><Button type="button" disabled={busy || !canCommit} onClick={commit}>{busy ? "Mengimpor…" : "Impor Produk"}</Button></FormActions></CardContent></Card>
      {results.length > 0 ? <Card><CardHeader><h2 className="font-semibold">Hasil impor</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Jumlah baris: {results.length} · Berhasil: {results.filter((result) => result.status === "success").length} · Gagal: {results.filter((result) => result.status === "failed").length}</p></CardHeader><CardContent><ul className="grid gap-1 text-sm">{results.map((result) => <li key={result.row}>Baris {result.row} · {result.sku} · {result.status === "success" ? `Berhasil (${result.product_id})` : `Gagal: ${result.error?.message ?? "Produk gagal diimpor."}`}</li>)}</ul></CardContent></Card> : null}</> : null}
  </section>;
}
