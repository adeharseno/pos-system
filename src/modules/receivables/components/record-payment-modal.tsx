"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormField, Input, Label, Select, Textarea } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";
import type { ReceivablePaymentMethod } from "../receivables-types";
import { validateClientPaymentAmount } from "../receivables-validation";

export function RecordPaymentModal({
  receivableId,
  invoiceNumber,
  outstandingAmount,
  today,
}: {
  receivableId: string;
  invoiceNumber: string;
  outstandingAmount: number;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ReceivablePaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = () => {
    setError(null);
    if (!amount) {
      setAmount(String(outstandingAmount));
    }
    setOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const check = validateClientPaymentAmount(amount, outstandingAmount);
    if (!check.valid) {
      setError(check.error ?? "Nominal pembayaran tidak valid.");
      return;
    }

    if (!paymentDate) {
      setError("Tanggal pembayaran wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/receivables/${receivableId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          payment_method: paymentMethod,
          amount: check.amount,
          payment_date: paymentDate,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.ok) {
        setError(body.error?.message ?? "Pembayaran belum dapat disimpan. Periksa kembali isian Anda.");
        return;
      }

      setOpen(false);
      setAmount("");
      setReference("");
      setNotes("");
      setRequestId(crypto.randomUUID());
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus sebelum hasil dipastikan. Klik Simpan Pembayaran lagi agar transaksi tetap idempoten."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={openModal}>
        Catat Pembayaran
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-receivable-payment-title"
        >
          <button
            type="button"
            aria-label="Tutup dialog"
            className="fixed inset-0 bg-gray-950/45"
            onClick={closeModal}
          />
          <form
            onSubmit={handleSubmit}
            className="relative z-10 w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div>
              <h2 id="record-receivable-payment-title" className="text-xl font-semibold text-gray-900">
                Catat Pembayaran Piutang
              </h2>
              <p className="mt-1 text-sm text-gray-600">Invoice {invoiceNumber}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <span className="text-sm font-medium text-amber-950">Sisa Piutang Saat Ini</span>
                <strong className="text-lg font-bold text-amber-950 tabular">
                  {formatRupiah(outstandingAmount)}
                </strong>
              </div>
            </div>

            <FormField>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rec-payment-amount">
                  Nominal Pembayaran (Rp) <span className="text-red-500">*</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setAmount(String(outstandingAmount))}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Bayar Penuh ({formatRupiah(outstandingAmount)})
                </button>
              </div>
              <Input
                id="rec-payment-amount"
                autoFocus
                required
                type="number"
                inputMode="decimal"
                min="1"
                max={outstandingAmount}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Masukkan nominal pembayaran"
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField>
                <Label htmlFor="rec-payment-method">
                  Metode Pembayaran <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="rec-payment-method"
                  required
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as ReceivablePaymentMethod)}
                >
                  <option value="cash">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="bank_transfer">Transfer Bank</option>
                </Select>
              </FormField>

              <FormField>
                <Label htmlFor="rec-payment-date">
                  Tanggal Pembayaran <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="rec-payment-date"
                  required
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </FormField>
            </div>

            <FormField>
              <Label htmlFor="rec-payment-reference">Referensi / Bukti (Opsional)</Label>
              <Input
                id="rec-payment-reference"
                type="text"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Contoh: No. Ref BCA / QRIS"
              />
            </FormField>

            <FormField>
              <Label htmlFor="rec-payment-notes">Catatan (Opsional)</Label>
              <Textarea
                id="rec-payment-notes"
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Keterangan tambahan pembayaran..."
              />
            </FormField>

            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
              <Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Menyimpan..." : "Simpan Pembayaran"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

