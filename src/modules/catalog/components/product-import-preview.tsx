"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ProductImportFileInfo, ProductImportMasterData, ProductImportPreviewRow } from "../application/preview-product-import";
import type { ProductImportCommitResult, ProductImportCommitRow } from "../application/product-import-commit";
import { submitProductImportBatches } from "../import-batches";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label, Select } from "@/modules/ui/components";

type LocalResult = Omit<ProductImportCommitResult, "status"> & { status: "success" | "failed" | "skipped" };
type MappingField = "categoryId" | "defaultSupplierId" | "storageLocationId";
const pageSize = 50;
const classificationLabel = (value: string) => value === "otc" ? "Bebas" : value === "otc_limited" ? "Bebas terbatas" : value === "prescription_required" ? "Wajib resep" : value;
const duplicate = (result: LocalResult) => result.error?.code === "DUPLICATE_SKU" || result.error?.code === "DUPLICATE_BARCODE";
const uniqueValues = (rows: ProductImportPreviewRow[], field: "category" | "supplier" | "storageLocation") => [...new Set(rows.map(row => row[field]).filter(Boolean))];

function mappedRows(rows: ProductImportPreviewRow[], master: ProductImportMasterData, cleared: Set<string>) {
  return rows.map(row => {
    const errors = [...row.baseErrors];
    const category = master.categories.find(item => item.id === row.categoryId);
    const subcategory = master.subcategories.find(item => item.id === row.subcategoryId);
    if (!category) errors.push("Pilih kategori yang sudah tersedia.");
    if (!subcategory || subcategory.category_id !== category?.id) errors.push("Pilih subkategori yang sesuai.");
    if (row.supplier && !master.suppliers.some(item => item.id === row.defaultSupplierId) && !cleared.has(`supplier:${row.supplier}`)) errors.push("Pemasok belum dipetakan.");
    if (row.storageLocation && !master.locations.some(item => item.id === row.storageLocationId) && !cleared.has(`storageLocation:${row.storageLocation}`)) errors.push("Lokasi penyimpanan belum dipetakan.");
    return { ...row, valid: errors.length === 0, errors };
  });
}

export function ProductImportPreview({ master }: { master: ProductImportMasterData }) {
  const [rawRows, setRawRows] = useState<ProductImportPreviewRow[]>([]);
  const [info, setInfo] = useState<ProductImportFileInfo>();
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<LocalResult[]>([]);
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const inFlight = useRef(false);
  const rows = useMemo(() => mappedRows(rawRows, master, cleared), [rawRows, master, cleared]);
  const finished = new Set(results.filter(result => result.status === "success" || duplicate(result)).map(result => result.row));
  const pending = rows.filter(row => row.valid && !finished.has(row.rowNumber));
  const resultMap = new Map(results.map(result => [result.row, result]));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const subcategoryGroups = [...new Map(rows.filter(row => row.subcategory).map(row => [`${row.categoryId}:${row.subcategory}`, { categoryId: row.categoryId, value: row.subcategory }])).values()];

  function mapValue(field: MappingField, source: "category" | "supplier" | "storageLocation", value: string, id: string | null) {
    setRawRows(current => current.map(row => {
      if (row[source] !== value) return row;
      if (field === "categoryId") return { ...row, categoryId: id, subcategoryId: master.subcategories.some(item => item.id === row.subcategoryId && item.category_id === id) ? row.subcategoryId : null };
      return { ...row, [field]: id };
    }));
    if (source !== "category") setCleared(current => { const next = new Set(current); if (id === null) next.add(`${source}:${value}`); else next.delete(`${source}:${value}`); return next; });
  }

  async function preview(form: FormData) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/products/import/preview", { method: "POST", body: form });
      const body = await response.json() as { ok?: boolean; data?: { rows: ProductImportPreviewRow[]; info?: ProductImportFileInfo }; error?: { message?: string } };
      if (!response.ok || !body.ok || !body.data) { setError(body.error?.message ?? "Berkas gagal diproses."); return; }
      setRawRows(body.data.rows); setInfo(body.data.info); setCleared(new Set()); setResults([]); setPage(1); setProgress({ completed: 0, total: 0 });
    } catch { setError("Berkas gagal diproses. Periksa koneksi Anda."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function commit() {
    if (inFlight.current || !pending.length) return;
    inFlight.current = true; setBusy(true); setError(""); setProgress({ completed: 0, total: pending.length });
    const preserved: LocalResult[] = results.filter(result => !pending.some(row => row.rowNumber === result.row));
    const invalid: LocalResult[] = rows.filter(row => !row.valid && !finished.has(row.rowNumber)).map(row => ({ row: row.rowNumber, sku: row.sku, status: "skipped", error: { code: "VALIDATION_FAILED", message: row.errors.join(" ") } }));
    const merge = (received: ProductImportCommitResult[]) => [...new Map([...preserved, ...invalid, ...received].map(result => [result.row, result])).values()];
    setResults(merge([]));
    const payload: ProductImportCommitRow[] = pending.map(row => ({ rowNumber: row.rowNumber, sku: row.sku, name: row.name, genericName: row.genericName, manufacturer: row.manufacturer, baseUnit: row.baseUnit, sellingPrice: Number(row.sellingPrice), costPrice: row.costPrice === "" ? 0 : Number(row.costPrice), barcode: row.barcode, drugClassification: row.drugClassification, minimumStock: row.minimumStock === "" ? 0 : Number(row.minimumStock), isActive: row.isActive, categoryId: row.categoryId, subcategoryId: row.subcategoryId, defaultSupplierId: row.defaultSupplierId, storageLocationId: row.storageLocationId }));
    try {
      await submitProductImportBatches(payload, async batch => {
        const response = await fetch("/api/products/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: batch }) });
        const body = await response.json() as { ok?: boolean; data?: { results: ProductImportCommitResult[] }; error?: { message?: string } };
        if (!response.ok || !body.ok || !body.data) throw new Error(body.error?.message ?? "Impor terhenti.");
        return body.data.results;
      }, (received, completed) => { setResults(merge(received)); setProgress({ completed, total: pending.length }); });
    } catch { setError("Impor terhenti. Hasil batch sebelumnya tetap tersimpan. Periksa koneksi, lalu ulangi baris yang belum selesai; SKU yang sudah ada tidak ditimpa."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const mappingSelect = (field: MappingField, source: "category" | "supplier" | "storageLocation", value: string, options: { id: string; name?: string; full_code?: string }[], optional = false) => {
    const selected = rows.find(row => row[source] === value)?.[field];
    const state = optional && !cleared.has(`${source}:${value}`) && !selected ? "__unmapped__" : selected ?? "";
    const id = `map-${source}-${encodeURIComponent(value)}`;
    return <FormField key={id}><Label htmlFor={id}>{source === "category" ? "Kategori" : source === "supplier" ? "Pemasok" : "Lokasi"}: {value}</Label><Select id={id} disabled={busy} value={state} onChange={event => mapValue(field, source, value, event.target.value || null)}>{optional ? <><option value="__unmapped__" disabled>Pilih pemetaan atau kosongkan</option><option value="">Kosongkan pemetaan</option></> : <option value="">Pilih kategori yang tersedia</option>}{options.map(item => <option key={item.id} value={item.id}>{item.name ?? item.full_code}</option>)}</Select></FormField>;
  };

  return <section className="mt-5 grid gap-5">
    <Card><CardHeader><h2 className="font-semibold">Unggah Berkas</h2></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); void preview(new FormData(event.currentTarget)); }} className="grid gap-4"><FormField><Label htmlFor="file">Berkas .xlsx atau .csv</Label><Input id="file" required name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} /></FormField><p className="text-sm text-[var(--text-muted)]">Maksimum 5 MB dan 10.000 baris. Pemeriksaan belum menyimpan data.</p><FormActions><Button type="submit" disabled={busy}>Periksa Berkas</Button></FormActions></form></CardContent></Card>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
    {rows.length ? <>
      <Card><CardHeader><h2 className="font-semibold">Pemetaan Data</h2><p className="mt-2 text-sm text-gray-600">{rows.length.toLocaleString("id-ID")} baris · {rows.filter(row => row.valid).length.toLocaleString("id-ID")} valid · {rows.filter(row => !row.valid).length.toLocaleString("id-ID")} perlu diperbaiki</p></CardHeader><CardContent className="space-y-5">
        {!master.categories.length || !master.subcategories.length ? <p className="text-base text-amber-900">Kategori dan subkategori belum tersedia. Tambahkan data yang benar melalui <Link className="underline" href="/products/categories">Kelola Kategori</Link> dan <Link className="underline" href="/products/subcategories">Kelola Subkategori</Link>, lalu periksa ulang berkas.</p> : null}
        <div className="grid gap-5 md:grid-cols-2">{uniqueValues(rows, "category").map(value => mappingSelect("categoryId", "category", value, master.categories))}{subcategoryGroups.map(group => {
          const options = master.subcategories.filter(item => item.category_id === group.categoryId);
          const selected = rows.find(row => row.categoryId === group.categoryId && row.subcategory === group.value)?.subcategoryId;
          const id = `map-sub-${group.categoryId}-${encodeURIComponent(group.value)}`;
          return <FormField key={id}><Label htmlFor={id}>Subkategori: {group.value} ({master.categories.find(item => item.id === group.categoryId)?.name ?? "pilih kategori dahulu"})</Label><Select id={id} disabled={busy || !group.categoryId} value={selected ?? ""} onChange={event => { const selectedId = event.target.value || null; setRawRows(current => current.map(row => row.categoryId === group.categoryId && row.subcategory === group.value ? { ...row, subcategoryId: selectedId } : row)); }}><option value="">Pilih subkategori yang tersedia</option>{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField>;
        })}{uniqueValues(rows, "supplier").map(value => mappingSelect("defaultSupplierId", "supplier", value, master.suppliers, true))}{uniqueValues(rows, "storageLocation").map(value => mappingSelect("storageLocationId", "storageLocation", value, master.locations, true))}</div>
        {info ? <details><summary className="min-h-13 cursor-pointer py-3 font-medium">Kolom dan sheet yang digunakan</summary><div className="space-y-3 text-sm"><p>Sheet produk: {info.productSheets.join(", ")}</p><p>Sheet referensi diabaikan: {info.ignoredSheets.join(", ") || "Tidak ada"}</p><p>Kolom dipetakan: {info.mappedColumns.map(item => item.column).join(", ")}</p><p>Kolom diabaikan: {info.ignoredColumns.map(item => item.column).join(", ") || "Tidak ada"}</p></div></details> : null}
        <p className="text-sm text-gray-600">Tidak membuat data acuan atau stok awal. Status nonaktif dari berkas tetap dipertahankan.</p>
      </CardContent></Card>
      <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Pemeriksaan barang sebelum impor</caption><thead className="bg-gray-50"><tr>{["Sheet / Baris", "Pemeriksaan", "SKU", "Nama Barang", "Produsen", "Kategori", "Subkategori", "Satuan", "Harga Jual", "Harga Modal", "Barcode", "Klasifikasi", "Status Barang", "Hasil / Kesalahan"].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead><tbody>{shown.map(row => { const result = resultMap.get(row.rowNumber); return <tr key={row.rowNumber} className="border-t border-gray-200"><td className="p-4">{row.sheetName} / {row.sheetRowNumber}</td><td className="p-4">{row.valid ? "Valid" : "Perlu diperbaiki"}</td><td className="p-4">{row.sku}</td><td className="p-4">{row.name}</td><td className="p-4">{row.manufacturer}</td><td className="p-4">{row.category}</td><td className="p-4">{row.subcategory}</td><td className="p-4">{row.baseUnit}</td><td className="p-4">{row.sellingPrice}</td><td className="p-4">{row.costPrice || "0"}</td><td className="p-4">{row.barcode}</td><td className="p-4">{classificationLabel(row.drugClassification)}</td><td className="p-4">{row.isActive ? "Aktif" : "Nonaktif"}</td><td className="p-4">{result ? result.status === "success" ? "Berhasil" : `${result.status === "skipped" || duplicate(result) ? "Dilewati" : "Gagal"}: ${result.error?.message}` : row.errors.join(" ")}</td></tr>; })}</tbody></table></div><CardContent><nav aria-label="Halaman pratinjau impor" className="flex flex-wrap items-center justify-between gap-4"><p>Halaman {page} dari {pages}</p><div className="flex gap-3"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>Sebelumnya</Button><Button variant="secondary" disabled={busy || page >= pages} onClick={() => setPage(value => value + 1)}>Berikutnya</Button></div></nav></CardContent></Card>
      <Card><CardContent className="space-y-4"><p className="text-base">{pending.length.toLocaleString("id-ID")} baris valid siap diimpor. Baris belum valid dilewati.</p>{progress.total ? <p role="status">Diproses {progress.completed.toLocaleString("id-ID")} dari {progress.total.toLocaleString("id-ID")} baris.</p> : null}{results.length ? <p role="status">Berhasil: {results.filter(result => result.status === "success").length.toLocaleString("id-ID")} · Gagal: {results.filter(result => result.status === "failed" && !duplicate(result)).length.toLocaleString("id-ID")} · Dilewati: {results.filter(result => result.status === "skipped" || duplicate(result)).length.toLocaleString("id-ID")}</p> : null}<FormActions><Button type="button" disabled={busy || !pending.length} onClick={commit}>{busy ? "Memproses..." : "Impor Baris Valid"}</Button></FormActions></CardContent></Card>
    </> : null}
  </section>;
}
