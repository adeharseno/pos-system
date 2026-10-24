"use client";

import { useMemo, useState } from "react";
import type { ProductImportMasterData, ProductImportPreviewRow } from "../application/preview-product-import";

type ApiResponse = { ok: boolean; data?: { rows: ProductImportPreviewRow[] }; error?: { message?: string } };
type CommitResult = { row: number; sku: string; status: "success" | "failed"; product_id?: string; error?: { code: string; message: string } };
type CommitResponse = { ok: boolean; data?: { results: CommitResult[] }; error?: { message?: string } };
type MappingField = "categoryId" | "subcategoryId" | "defaultSupplierId" | "storageLocationId";

function mappedRows(rows: ProductImportPreviewRow[], master: ProductImportMasterData, clearedOptional: Set<string>) {
  return rows.map((row) => {
    const errors = [...row.baseErrors];
    const category = master.categories.find((item) => item.id === row.categoryId);
    const subcategory = master.subcategories.find((item) => item.id === row.subcategoryId);
    if (row.category && !category) errors.push("Kategori tidak ditemukan pada master data.");
    if (row.subcategory && !subcategory) errors.push("Subkategori tidak ditemukan pada master data.");
    if (category && subcategory && subcategory.category_id !== category.id) errors.push("Subkategori tidak sesuai dengan kategori.");
    if (row.supplier && !master.suppliers.some((item) => item.id === row.defaultSupplierId) && !clearedOptional.has(`supplier:${row.supplier}`)) errors.push("Supplier tidak ditemukan pada master data.");
    if (row.storageLocation && !master.locations.some((item) => item.id === row.storageLocationId) && !clearedOptional.has(`storageLocation:${row.storageLocation}`)) errors.push("Lokasi penyimpanan tidak ditemukan pada master data.");
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
      setClearedOptional((current) => {
        const next = new Set(current);
        if (id === null) next.add(key); else next.delete(key);
        return next;
      });
    }
  }

  async function preview(form: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const response = await fetch("/api/products/import/preview", { method: "POST", body: form });
      const body = await response.json() as ApiResponse;
      if (!response.ok || !body.ok) {
        setRawRows([]); setClearedOptional(new Set());
        setError(body.error?.message ?? "File gagal diproses.");
        return;
      }
      setRawRows(body.data?.rows ?? []); setClearedOptional(new Set());
    } catch {
      setRawRows([]); setClearedOptional(new Set());
      setError("File gagal diproses.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (busy || !canCommit) return;
    setBusy(true);
    setError("");
    setResults([]);
    const payload = rows.map((row) => ({
      rowNumber: row.rowNumber, sku: row.sku, name: row.name, genericName: row.genericName, manufacturer: row.manufacturer,
      baseUnit: row.baseUnit, sellingPrice: Number(row.sellingPrice), costPrice: row.costPrice === "" ? 0 : Number(row.costPrice),
      barcode: row.barcode, drugClassification: row.drugClassification, minimumStock: row.minimumStock === "" ? 0 : Number(row.minimumStock),
      categoryId: row.categoryId, subcategoryId: row.subcategoryId, defaultSupplierId: row.defaultSupplierId, storageLocationId: row.storageLocationId,
    }));
    try {
      const response = await fetch("/api/products/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: payload }) });
      const body = await response.json() as CommitResponse;
      if (!response.ok || !body.ok) {
        setError(body.error?.message ?? "Import produk gagal.");
        return;
      }
      setResults(body.data?.results ?? []);
    } catch {
      setError("Import produk gagal.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-5 grid gap-5">
    <form action={preview} className="grid gap-3 rounded border bg-white p-4">
      <label className="grid gap-1 text-sm font-medium">File .xlsx atau .csv
        <input required name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </label>
      <p className="text-sm text-[var(--text-muted)]">Maksimum 5 MB. Data hanya dipreview dan belum disimpan.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button disabled={busy}>{busy ? "Memproses…" : "Preview File"}</button>
    </form>
    {rows.length > 0 ? <>
      <section className="grid gap-4 rounded border bg-white p-4">
        <div><h2 className="font-semibold">Pemetaan master data</h2><p className="text-sm text-[var(--text-muted)]">Satu pemetaan diterapkan ke semua baris dengan nilai unggahan yang sama.</p></div>
        {uniqueValues(rows, "category").map((value) => <label key={`category-${value}`} className="grid gap-1 text-sm">Kategori unggahan: <strong>{value}</strong><select value={rows.find((row) => row.category === value)?.categoryId ?? ""} onChange={(event) => mapValue("categoryId", "category", value, event.target.value || null)}><option value="">Pilih kategori</option>{master.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
        {uniqueValues(rows, "subcategory").map((value) => <label key={`subcategory-${value}`} className="grid gap-1 text-sm">Subkategori unggahan: <strong>{value}</strong><select value={rows.find((row) => row.subcategory === value)?.subcategoryId ?? ""} onChange={(event) => mapValue("subcategoryId", "subcategory", value, event.target.value || null)}><option value="">Pilih subkategori</option>{master.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
        {uniqueValues(rows, "supplier").map((value) => { const selected = rows.find((row) => row.supplier === value)?.defaultSupplierId; const state = clearedOptional.has(`supplier:${value}`) ? "" : selected ?? "__unmapped__"; return <label key={`supplier-${value}`} className="grid gap-1 text-sm">Supplier unggahan: <strong>{value}</strong><select value={state} onChange={(event) => mapValue("defaultSupplierId", "supplier", value, event.target.value || null)}><option value="__unmapped__" disabled>Pilih pemetaan atau kosongkan</option><option value="">Kosongkan pemetaan</option>{master.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; })}
        {uniqueValues(rows, "storageLocation").map((value) => { const selected = rows.find((row) => row.storageLocation === value)?.storageLocationId; const state = clearedOptional.has(`storageLocation:${value}`) ? "" : selected ?? "__unmapped__"; return <label key={`location-${value}`} className="grid gap-1 text-sm">Lokasi unggahan: <strong>{value}</strong><select value={state} onChange={(event) => mapValue("storageLocationId", "storageLocation", value, event.target.value || null)}><option value="__unmapped__" disabled>Pilih pemetaan atau kosongkan</option><option value="">Kosongkan pemetaan</option>{master.locations.map((item) => <option key={item.id} value={item.id}>{item.full_code}</option>)}</select></label>; })}
      </section>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm"><thead><tr><th>Baris</th><th>Status</th><th>SKU</th><th>Nama Produk</th><th>Nama Generik</th><th>Manufacturer</th><th>Kategori</th><th>Subkategori</th><th>Unit Dasar</th><th>Harga Jual</th><th>Harga Modal</th><th>Barcode</th><th>Klasifikasi</th><th>Minimum Stok</th><th>Supplier</th><th>Lokasi Penyimpanan</th><th>Kesalahan</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.valid ? "Valid" : "Tidak valid"}</td><td>{row.sku}</td><td>{row.name}</td><td>{row.genericName}</td><td>{row.manufacturer}</td><td>{row.category}</td><td>{row.subcategory}</td><td>{row.baseUnit}</td><td>{row.sellingPrice}</td><td>{row.costPrice}</td><td>{row.barcode}</td><td>{row.drugClassification}</td><td>{row.minimumStock}</td><td>{row.supplier}</td><td>{row.storageLocation}</td><td>{row.errors.join(" ")}</td></tr>)}
        </tbody></table>
      </div>
      <section className="grid gap-2 rounded border bg-white p-4">
        <p className="text-sm text-[var(--text-muted)]">{canCommit ? "Semua baris valid dan siap diimpor." : "Perbaiki semua baris tidak valid sebelum import."}</p>
        <button disabled={busy || !canCommit} onClick={commit}>{busy ? "Mengimpor…" : "Import Produk"}</button>
      </section>
      {results.length > 0 ? <section className="grid gap-3 rounded border bg-white p-4"><div><h2 className="font-semibold">Hasil import</h2><p>Total rows: {results.length} · Success: {results.filter((result) => result.status === "success").length} · Failed: {results.filter((result) => result.status === "failed").length}</p></div><ul className="grid gap-1 text-sm">{results.map((result) => <li key={result.row}>Baris {result.row} · {result.sku} · {result.status === "success" ? `Berhasil (${result.product_id})` : `Gagal: ${result.error?.message ?? "Produk gagal diimpor."}`}</li>)}</ul></section> : null}
    </> : null}
  </section>;
}
