"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, FormActions, FormField, Input, Label } from "@/modules/ui/components";
import { MAX_INVOICE_FILE_BYTES, moneyCents, PAYMENT_LABELS, paymentStatus } from "../invoice-input";
import { SupplierPicker } from "./supplier-picker";

export type InvoiceDraft = { status?: string; id: string; version: number; invoice_number: string; invoice_date: string; total_amount: number; document_name: string | null; supplier_id: string; suppliers: { name: string } | null; purchase_invoice_payments: { amount: number; payment_key: string }[] };

export function InvoiceForm({ invoice, onSaved, onWorkingChange }: { invoice?: InvoiceDraft; onSaved?: (id: string) => Promise<void>; onWorkingChange?: (working: boolean) => void }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(invoice ? { id: invoice.supplier_id, name: invoice.suppliers?.name ?? "Pemasok tersimpan" } : null);
  const [total, setTotal] = useState(invoice ? String(invoice.total_amount) : "");
  const [paid, setPaid] = useState(String(invoice?.purchase_invoice_payments.find(payment => payment.payment_key === "initial")?.amount ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ id: string; requestId: string; form: FormData } | null>(null);
  const invoiceId = useRef(invoice?.id ?? "");
  useEffect(() => { onWorkingChange?.(busy || uncertain); }, [busy, uncertain, onWorkingChange]);
  let status = "Belum Dibayar";
  try { status = PAYMENT_LABELS[paymentStatus(moneyCents(total), moneyCents(paid))]; } catch { /* Incomplete fields are validated on submit. */ }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    let form: FormData;
    if (uncertain && attempt.current) form = attempt.current.form;
    else {
      if (!supplier) { setError("Pilih nama pemasok dari daftar."); return; }
      try { if (moneyCents(total) <= 0 || moneyCents(paid) > moneyCents(total)) throw new Error(); }
      catch { setError("Total harus positif. Pembayaran harus 0 sampai total, maksimal dua angka desimal."); return; }
      form = new FormData(event.currentTarget);
      const file = form.get("document");
      if (file instanceof File && file.size > MAX_INVOICE_FILE_BYTES) { setError("Dokumen maksimal 10 MB."); return; }
      if (!invoiceId.current) invoiceId.current = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      form.set("id", invoiceId.current); form.set("request_id", requestId);
      if (invoice) form.set("version", String(invoice.version));
      attempt.current = { id: invoiceId.current, requestId, form };
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/purchase-invoices${invoice ? `/${invoice.id}` : ""}`, { method: invoice ? "PATCH" : "POST", body: form });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setUncertain(response.status >= 500); setError(body.error?.message ?? "Invoice gagal disimpan."); return;
      }
      setUncertain(false);
      if (onSaved) await onSaved(body.data.id);
      else { router.push(`/purchase-invoices/${body.data.id}?saved=1`); router.refresh(); }
    } catch { setUncertain(true); setError("Hasil penyimpanan belum dapat dipastikan. Simpan kembali dengan data yang sama atau periksa daftar invoice."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-6 space-y-5"><Card><CardContent className="space-y-6">
    <fieldset disabled={busy || uncertain} className="grid min-w-0 gap-6 md:grid-cols-2">
      <div className="md:col-span-2"><SupplierPicker value={supplier} onChange={setSupplier} disabled={busy || uncertain} /></div>
      <FormField><Label htmlFor="invoice_number">Nomor Invoice</Label><Input id="invoice_number" name="invoice_number" required maxLength={100} defaultValue={invoice?.invoice_number ?? ""} /></FormField>
      <FormField><Label htmlFor="invoice_date">Tanggal Invoice</Label><Input id="invoice_date" name="invoice_date" type="date" required defaultValue={invoice?.invoice_date ?? ""} /></FormField>
      <FormField><Label htmlFor="total_amount">Total Belanja (Rp)</Label><Input id="total_amount" name="total_amount" type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" required value={total} onChange={event => setTotal(event.target.value)} /></FormField>
      <FormField><Label htmlFor="paid_amount">Jumlah Dibayarkan (Rp)</Label><Input id="paid_amount" name="paid_amount" type="number" inputMode="decimal" min="0" max={total || undefined} step="0.01" required value={paid} onChange={event => setPaid(event.target.value)} /></FormField>
      <FormField className="md:col-span-2"><Label htmlFor="document">Upload Invoice (opsional)</Label><Input id="document" name="document" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /><p className="text-base text-gray-600">Foto JPG, PNG, WebP, atau PDF. Maksimal 10 MB.</p>{invoice?.document_name ? <p className="break-words text-base text-gray-700">Dokumen saat ini: {invoice.document_name}. Kosongkan untuk tetap menggunakan dokumen ini.</p> : null}</FormField>
    </fieldset>
    <p role="status" className="text-base font-medium">Status Pembayaran: {status}</p>
    <p className="text-base text-gray-600">Invoice disimpan sebagai Draft. Belum menambah stok atau mengubah harga.</p>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
    {uncertain ? <Link className="inline-flex min-h-12 items-center font-medium text-brand-600 underline" href="/purchase-invoices">Periksa Daftar Invoice</Link> : null}
    <FormActions><Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Invoice"}</Button></FormActions>
  </CardContent></Card></form>;
}
