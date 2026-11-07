"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InitialImportRow } from "../application/initial-product-import";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label } from "@/modules/ui/components";

type Preview = { rows: InitialImportRow[]; valid: number; warnings: number; errors: number; totalStock: number };

const numberFormat = new Intl.NumberFormat("id-ID");

export function InitialProductImport() {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const requestRef = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  async function inspect(form: FormData) {
    if (inFlight.current) return;
    const file = form.get("file");
    if (!(file instanceof File)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/products/import-initial/preview", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "File tidak dapat diperiksa.");
      fileRef.current = file;
      requestRef.current = crypto.randomUUID();
      setAcknowledged(false);
      setPreview(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File tidak dapat diperiksa.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function commit() {
    if (inFlight.current || !fileRef.current || !preview || preview.errors) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", fileRef.current);
    form.set("request_id", requestRef.current);
    form.set("acknowledge_warnings", String(acknowledged));
    try {
      const response = await fetch("/api/products/import-initial/commit", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Impor data awal gagal. Coba lagi dengan file yang sama.");
      router.push(`/products?initialImport=${encodeURIComponent(String(body.data.product_count))}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hasil impor belum dapat dipastikan. Coba lagi dengan file yang sama.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="mt-6 space-y-5">
    <Card>
      <CardHeader><h2 className="text-lg font-semibold">Pilih File Data Awal</h2></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); void inspect(new FormData(event.currentTarget)); }}>
          <FormField>
            <Label htmlFor="initial-file">File .xlsx</Label>
            <Input id="initial-file" name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} />
          </FormField>
          <p className="text-sm text-gray-600">Gunakan format produk_final.xlsx. Pemeriksaan ini belum menyimpan data.</p>
          <FormActions><Button disabled={busy} type="submit">{busy ? "Memeriksa..." : "Lihat Preview"}</Button></FormActions>
        </form>
      </CardContent>
    </Card>

    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}

    {preview ? <Card>
      <CardHeader><h2 className="text-lg font-semibold">Preview Impor</h2></CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-4">
          <div><dt className="text-gray-600">Produk valid</dt><dd className="text-2xl font-semibold">{numberFormat.format(preview.valid)}</dd></div>
          <div><dt className="text-gray-600">Baris error</dt><dd className="text-2xl font-semibold text-red-700">{numberFormat.format(preview.errors)}</dd></div>
          <div><dt className="text-gray-600">Dengan peringatan</dt><dd className="text-2xl font-semibold text-amber-700">{numberFormat.format(preview.warnings)}</dd></div>
          <div><dt className="text-gray-600">Total stok awal</dt><dd className="text-2xl font-semibold">{numberFormat.format(preview.totalStock)}</dd></div>
        </dl>

        <div className="rounded-lg bg-amber-50 p-4 text-amber-900">
          <p>Harga modal yang kosong akan disimpan sebagai 0.</p>
          <p className="mt-1 font-medium">Stok pada file akan benar-benar dimasukkan sebagai stok awal tanpa batch fisik dan tanpa tanggal kedaluwarsa.</p>
          <p className="mt-1">SKU kosong mendapat kode internal. Satuan dan kategori kosong tetap ditandai belum ditentukan.</p>
        </div>

        {preview.errors ? <div>
          <p className="font-medium text-red-800">Perbaiki seluruh baris error sebelum impor.</p>
          <ul className="mt-2 max-h-56 overflow-auto text-sm text-red-800">
            {preview.rows.filter(row => row.errors.length).slice(0, 100).map(row => <li key={row.rowNumber}>Baris {row.rowNumber}: {row.errors.join(" ")}</li>)}
          </ul>
          {preview.errors > 100 ? <p className="mt-2 text-sm text-red-800">Menampilkan 100 baris error pertama dari {numberFormat.format(preview.errors)} baris.</p> : null}
        </div> : null}

        {preview.warnings ? <div className="max-h-64 overflow-auto rounded-lg border border-amber-200 p-4"><p className="font-medium">Peringatan yang perlu ditinjau</p><ul className="mt-2 text-sm">{preview.rows.filter(row => row.warnings.length).slice(0, 200).map(row => <li key={row.rowNumber}>Baris {row.rowNumber} · {row.name}: {row.warnings.join(" ")}</li>)}</ul></div> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Contoh data yang akan diimpor</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Baris</th>
                <th scope="col" className="px-3 py-3 font-medium">SKU</th>
                <th scope="col" className="px-3 py-3 font-medium">Nama</th>
                <th scope="col" className="px-3 py-3 font-medium">Satuan</th>
                <th scope="col" className="px-3 py-3 font-medium">Harga</th>
                <th scope="col" className="px-3 py-3 font-medium">Stok</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {preview.rows.slice(0, 50).map(row => <tr key={row.rowNumber}>
                <td className="px-3 py-3 text-gray-600 tabular">{row.rowNumber}</td>
                <td className="px-3 py-3 break-all">{row.sku || "—"}</td>
                <td className="px-3 py-3">{row.name || "—"}</td>
                <td className="px-3 py-3">{row.baseUnit || "Belum Ditentukan"}</td>
                <td className="px-3 py-3 tabular">{row.errors.length ? "—" : numberFormat.format(row.sellingPrice)}</td>
                <td className="px-3 py-3 tabular">{row.errors.length ? "—" : numberFormat.format(row.stock)}</td>
                <td className="px-3 py-3">{row.errors.length ? <span className="font-medium text-red-700">Error</span> : row.warnings.length ? <span className="font-medium text-amber-700">Peringatan</span> : <span className="font-medium text-green-700">Siap</span>}</td>
              </tr>)}
            </tbody>
          </table>
          {preview.rows.length > 50 ? <p className="mt-2 text-sm text-gray-600">Menampilkan 50 baris pertama dari {numberFormat.format(preview.rows.length)} baris.</p> : null}
        </div>

        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>Saya memahami data dengan peringatan tetap dibuat sebagai produk terpisah dan perlu dilengkapi kemudian.</span></label>
        <FormActions>
          <Button type="button" disabled={busy || preview.errors > 0 || (preview.warnings > 0 && !acknowledged)} onClick={() => void commit()}>{busy ? "Mengimpor..." : "Konfirmasi Impor Data Awal"}</Button>
        </FormActions>
      </CardContent>
    </Card> : null}
  </div>;
}
