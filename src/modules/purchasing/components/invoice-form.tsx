"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, FormActions, FormField, Input, Label, Select } from "@/modules/ui/components";
import { invoiceDueDate, MAX_INVOICE_FILE_BYTES, moneyCents, PAYMENT_LABELS, paymentStatus, type PurchasePaymentMethod } from "../invoice-input";
import { SupplierPicker } from "./supplier-picker";

export type InvoiceDraft = { status?: string; id: string; version: number; invoice_number: string; invoice_date: string; total_amount: number; payment_method?: string | null; due_days?: number | null; due_date?: string | null; document_name: string | null; supplier_id: string; suppliers: { name: string } | null; purchase_invoice_payments: { amount: number; payment_key: string }[] };

export function InvoiceForm({ invoice, onSaved, onWorkingChange }: { invoice?: InvoiceDraft; onSaved?: (id: string) => Promise<void>; onWorkingChange?: (working: boolean) => void }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(invoice ? { id: invoice.supplier_id, name: invoice.suppliers?.name ?? "Pemasok tersimpan" } : null);
  const [total, setTotal] = useState(invoice ? String(invoice.total_amount) : "");
  const paid = invoice?.purchase_invoice_payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const inferredMethod = invoice?.payment_method === "cash" || invoice?.payment_method === "terms" ? invoice.payment_method : invoice && paid >= invoice.total_amount ? "cash" : invoice ? "terms" : "";
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod | "">(inferredMethod);
  const [dueDays, setDueDays] = useState(invoice?.due_days ? String(invoice.due_days) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ id: string; requestId: string; form: FormData } | null>(null);
  const invoiceId = useRef(invoice?.id ?? "");
  useEffect(() => { onWorkingChange?.(busy || uncertain); }, [busy, uncertain, onWorkingChange]);
  let status = "Belum Dibayar";
  try { status = paymentMethod === "cash" ? PAYMENT_LABELS.paid : PAYMENT_LABELS[paymentStatus(moneyCents(total), Math.round(paid * 100))]; } catch { /* Incomplete fields are validated on submit. */ }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    let form: FormData;
    if (uncertain && attempt.current) form = attempt.current.form;
    else {
      if (!supplier) { setError("Pilih nama pemasok dari daftar."); return; }
      try { if (moneyCents(total) <= 0 || !paymentMethod || (paymentMethod === "terms" && (!/^\d+$/.test(dueDays) || Number(dueDays) <= 0))) throw new Error(); }
      catch { setError("Total harus positif. Pilih metode pembayaran dan isi hari jatuh tempo untuk Tempo."); return; }
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
      <FormField><Label htmlFor="payment_method">Metode Pembayaran</Label><Select id="payment_method" name="payment_method" required value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PurchasePaymentMethod | "")}><option value="">Pilih metode</option><option value="cash">TUNAI</option><option value="terms">TEMPO</option></Select></FormField>
      {paymentMethod === "terms" ? <FormField><Label htmlFor="due_days">Jatuh Tempo (hari)</Label><Input id="due_days" name="due_days" type="number" inputMode="numeric" min="1" max="36500" step="1" required value={dueDays} onChange={event => setDueDays(event.target.value)} />{invoice?.invoice_date && /^\d+$/.test(dueDays) && Number(dueDays)>0 ? <p className="text-sm text-gray-600">Jatuh tempo: {invoiceDueDate(invoice.invoice_date,Number(dueDays))}</p> : null}</FormField> : null}
      <FormField className="md:col-span-2"><Label htmlFor="document">Upload Invoice (tidak wajib)</Label><Input id="document" name="document" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />{invoice?.document_name ? <p className="break-words text-base text-gray-700">Dokumen saat ini: {invoice.document_name}. Kosongkan untuk tetap menggunakan dokumen ini.</p> : null}</FormField>
    </fieldset>
    <p role="status" className="text-base font-medium">Status Pembayaran: {status}</p>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
    {uncertain ? <Link className="inline-flex min-h-12 items-center font-medium text-brand-600 underline" href="/purchase-invoices">Periksa Daftar Invoice</Link> : null}
    <FormActions><Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Invoice"}</Button></FormActions>
  </CardContent></Card></form>;
}
