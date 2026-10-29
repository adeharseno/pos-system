"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Input, Label } from "@/modules/ui/components";
import { formatInvoiceAmount } from "../invoice-presentation";

export function RecordPaymentDialog({ invoiceId, remaining, today }: { invoiceId: string; remaining: number; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) { setOpen(false); setError(""); } };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > remaining) { setError("Jumlah harus lebih dari nol dan tidak boleh melebihi sisa hutang."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/purchase-invoices/${invoiceId}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request_id: requestId, amount, payment_date: date }) });
      const body = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) { setError(body.error?.message ?? "Pembayaran belum dapat disimpan. Coba kembali."); return; }
      setOpen(false); setAmount(""); setRequestId(crypto.randomUUID()); router.refresh();
    } catch { setError("Hasil penyimpanan belum dapat dipastikan. Coba kembali dengan tombol yang sama."); }
    finally { setBusy(false); }
  }
  return <><Button type="button" onClick={() => setOpen(true)}>Catat Pembayaran</Button>{open ? <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button type="button" aria-label="Tutup dialog" className="absolute inset-0 bg-gray-950/40" onClick={close}/><form onSubmit={submit} className="relative z-10 w-full max-w-lg space-y-6 rounded-2xl bg-white p-6 shadow-xl"><div><h2 id="payment-title" className="text-xl font-semibold text-gray-900">Catat Pembayaran</h2><p className="mt-2 text-base text-gray-600">Sisa hutang: <strong>{formatInvoiceAmount(remaining)}</strong></p></div><FormField><Label htmlFor="payment-amount">Jumlah Dibayarkan (Rp)</Label><Input id="payment-amount" autoFocus required type="number" inputMode="decimal" min="0.01" max={remaining} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></FormField><FormField><Label htmlFor="payment-date">Tanggal Pembayaran</Label><Input id="payment-date" required type="date" value={date} onChange={event => setDate(event.target.value)} /></FormField>{error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-base text-red-700">{error}</p> : null}<div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" onClick={close} disabled={busy}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Pembayaran"}</Button></div></form></div> : null}</>;
}
