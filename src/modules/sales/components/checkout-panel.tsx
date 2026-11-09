"use client";
import { useRef, useState } from "react";
import type { CartLine } from "../cart";
import { DEFAULT_PRESCRIPTION_CATEGORY, type CheckoutResult, type PaymentMethod } from "../types";
import type { PrescriptionPayload } from "../checkout-ui";
import { buildBankTransferCheckoutPayload, buildBpjsCheckoutPayload, buildCashCheckoutPayload, buildQrisCheckoutPayload, checkoutErrorMessage, previewChange, validateCashReceived } from "../checkout-ui";
import { formatRupiah, parseRupiahInput } from "@/modules/ui/currency";
import { CloseIcon } from "@/modules/ui/icons";
import { acquireSubmissionLock, clearPersistedPendingCheckout, computeCartFingerprint, getPersistedPendingCheckout, persistPendingCheckout, releaseSubmissionLock } from "../checkout-reliability";

type CashSuccess = CheckoutResult & { cashReceived: number };

interface ExtraItem {
  id: string;
  drugName: string;
  quantity: number;
  unitPrice: number;
}

export function CheckoutPanel({
  cart,
  estimatedTotal,
  onClose,
  onImmediateSuccess,
  onManualPaymentPending,
  onInsufficientStock,
}: {
  cart: CartLine[];
  estimatedTotal: number;
  onClose: () => void;
  onImmediateSuccess: (result: CashSuccess, method: "cash" | "bpjs") => void;
  onManualPaymentPending: (result: CheckoutResult, method: "qris" | "bank_transfer") => void;
  onInsufficientStock: () => Promise<string>;
}) {
  const submissionLock = useRef(false);
  const cartFingerprint = computeCartFingerprint(cart);
  const persisted = getPersistedPendingCheckout(cartFingerprint);
  const requestId = useRef<string | null>(persisted?.requestId ?? null);
  const successHandled = useRef(false);
  const [method, setMethod] = useState<Exclude<PaymentMethod, "bpjs">>("cash");
  const [cash, setCash] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(persisted?.uncertain ?? false);
  const [category, setCategory] = useState<"umum" | "bpjs" | "bebas">(DEFAULT_PRESCRIPTION_CATEGORY);
  const [patient, setPatient] = useState("");
  const [bpjsNumber, setBpjsNumber] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [prescriptionOrigin, setPrescriptionOrigin] = useState("");
  const [prescriptionDate, setPrescriptionDate] = useState("");
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);

  const extraTotal = category === "bpjs" ? extraItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0) : 0;
  const currentTotal = estimatedTotal + extraTotal;

  const prescriptionRequired = cart.some((line) => line.requiresPrescription);
  const cashValidation = category !== "bpjs" && method === "cash" ? validateCashReceived(cash, currentTotal) : null;
  const prescriptionInvalid = category !== "bebas" && prescriptionRequired && (!prescriptionOrigin.trim() || !patient.trim());
  const bpjsInvalid = category === "bpjs" && !bpjsNumber.trim();
  const susulanInvalid = category === "bpjs" && extraItems.some((it) => !it.drugName.trim() || it.quantity < 1 || it.unitPrice < 0);

  const selectCategory = (value: "umum" | "bpjs" | "bebas") => {
    setCategory(value);
    setError(null);
    if (value !== "bpjs") {
      setBpjsNumber("");
      setExtraItems([]);
    }
    if (value === "bebas") {
      setPatient("");
      setPrescriptionNumber("");
      setPrescriptionOrigin("");
      setPrescriptionDate("");
    }
    if (value === "bpjs") setCash(0);
  };

  const handleClose = () => {
    if (processing) return;
    if (uncertain) {
      const confirmed =
        typeof window !== "undefined" && window.confirm
          ? window.confirm("Status pembayaran belum dapat dipastikan. Menutup dialog ini dapat menyebabkan transaksi ganda jika Anda membuat transaksi baru. Tetap tutup?")
          : true;
      if (!confirmed) return;
    }
    onClose();
  };

  async function submit() {
    if (!acquireSubmissionLock(submissionLock) || cashValidation || prescriptionInvalid || bpjsInvalid || susulanInvalid) return;
    setProcessing(true);
    setError(null);
    setUncertain(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      requestId.current ??= crypto.randomUUID();
      persistPendingCheckout(requestId.current, cartFingerprint, false);
      const prescription: PrescriptionPayload = {
        category,
        patientName: patient.trim() || undefined,
        bpjsNumber: bpjsNumber.trim() || undefined,
        prescriptionNumber: prescriptionNumber.trim() || undefined,
        prescriptionOrigin: prescriptionOrigin.trim() || undefined,
        prescriptionDate: prescriptionDate || undefined,
      };
      const checkoutPayload =
        category === "bpjs"
          ? buildBpjsCheckoutPayload(cart, prescription, extraItems)
          : method === "cash"
          ? buildCashCheckoutPayload(cart, cash!, prescription)
          : method === "qris"
          ? buildQrisCheckoutPayload(cart, prescription)
          : buildBankTransferCheckoutPayload(cart, prescription);
      const response = await fetch("/api/transactions/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ ...checkoutPayload, request_id: requestId.current }),
      });
      const body = (await response.json()) as { ok: boolean; data?: CashSuccess; error?: { code: string } };
      if (!response.ok || !body.ok || !body.data) {
        const code = body.error?.code ?? "UNKNOWN";
        if (code === "INSUFFICIENT_STOCK") {
          const detail = await onInsufficientStock();
          setError(detail || checkoutErrorMessage(code));
        } else setError(checkoutErrorMessage(code));
        return;
      }

      if (successHandled.current) return;
      successHandled.current = true;
      clearPersistedPendingCheckout();
      if (category === "bpjs") onImmediateSuccess(body.data, "bpjs");
      else if (method === "cash") onImmediateSuccess(body.data, "cash");
      else onManualPaymentPending(body.data, method);
    } catch {
      setUncertain(true);
      if (requestId.current) persistPendingCheckout(requestId.current, cartFingerprint, true);
    } finally {
      clearTimeout(timeout);
      setProcessing(false);
      releaseSubmissionLock(submissionLock);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6">
      <button aria-label="Tutup pemeriksaan pembayaran" className="absolute inset-0 bg-zinc-950/40" onClick={handleClose} />
      <section aria-labelledby="checkout-title" aria-modal="true" role="dialog" className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex min-h-16 items-center justify-between border-b border-[var(--border)] px-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Pembayaran</p>
            <h2 className="text-lg font-semibold" id="checkout-title">
              Periksa Pesanan
            </h2>
          </div>
          <button aria-label="Tutup pemeriksaan pembayaran" className="grid size-11 place-items-center rounded-[7px] hover:bg-zinc-100" disabled={processing} onClick={handleClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-6 sm:py-8">
          <div className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)]">
            {cart.map((line) => (
              <div className="flex justify-between gap-4 p-3 text-sm" key={`${line.productId}:${line.productUnitId}`}>
                <div>
                  <p className="font-semibold">{line.productName}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {line.quantity} × {line.unitLabel}
                    {line.requiresPrescription ? " · Resep" : ""}
                  </p>
                </div>
                <span className="tabular shrink-0 font-medium">{formatRupiah(line.displayedUnitPrice * line.quantity)}</span>
              </div>
            ))}
            {category === "bpjs" &&
              extraItems.map((item) => (
                <div className="flex justify-between gap-4 p-3 text-sm bg-blue-50/40" key={item.id}>
                  <div>
                    <p className="font-semibold text-blue-950">{item.drugName || "(Nama Obat Belum Diisi)"}</p>
                    <p className="text-xs text-blue-700">
                      {item.quantity} × {formatRupiah(item.unitPrice)} · Produk Tambahan
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-medium text-blue-950">{formatRupiah(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
          </div>

          {category === "bpjs" ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExtraItems((items) => [...items, { id: crypto.randomUUID(), drugName: "", quantity: 1, unitPrice: 0 }])}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-blue-50 px-3 py-1.5 text-sm font-semibold text-[var(--accent)] hover:bg-blue-100"
              >
                + Tambah Barang
              </button>
            </div>
          ) : null}

          {category === "bpjs" && extraItems.length > 0 ? (
            <div className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-900">Form Produk Tambahan (BPJS)</p>
              {extraItems.map((item, index) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-white p-3 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Nama Obat"
                      value={item.drugName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExtraItems((items) => items.map((it, i) => (i === index ? { ...it, drugName: val } : it)));
                      }}
                      className="h-10 w-full rounded border border-[var(--border-strong)] bg-white px-2.5 text-sm"
                      maxLength={200}
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.quantity || ""}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setExtraItems((items) => items.map((it, i) => (i === index ? { ...it, quantity: val } : it)));
                      }}
                      className="h-10 w-full rounded border border-[var(--border-strong)] bg-white px-2.5 text-sm tabular"
                    />
                  </div>
                  <div className="w-36">
                    <div className="flex h-10 items-center rounded border border-[var(--border-strong)] bg-white px-2.5">
                      <span className="text-xs text-zinc-500 mr-1">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={item.unitPrice ? item.unitPrice.toLocaleString("id-ID") : ""}
                        onChange={(e) => {
                          const val = parseRupiahInput(e.target.value);
                          setExtraItems((items) => items.map((it, i) => (i === index ? { ...it, unitPrice: val ?? 0 } : it)));
                        }}
                        className="w-full text-sm tabular outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Hapus produk tambahan"
                    onClick={() => setExtraItems((items) => items.filter((_, i) => i !== index))}
                    className="grid size-10 shrink-0 place-items-center rounded text-red-600 hover:bg-red-50"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex items-end justify-between rounded-[var(--radius)] bg-zinc-50 p-4">
            <p className="text-sm font-semibold">Total</p>
            <strong className="tabular text-2xl">{formatRupiah(currentTotal)}</strong>
          </div>

          <fieldset className="mt-5 grid gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-zinc-50 p-4">
            <legend className="px-1 text-sm font-semibold">Kategori Penjualan</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["umum", "bpjs", "bebas"] as const).map((value) => (
                <button
                  type="button"
                  aria-pressed={category === value}
                  className={`min-h-11 rounded-[7px] border-2 px-3 text-sm font-semibold ${
                    category === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-white"
                  }`}
                  key={value}
                  onClick={() => selectCategory(value)}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
            {category !== "bebas" ? (
              <>
                <label className="grid gap-1 text-sm font-medium">
                  Nama Pasien
                  <input className="h-11 rounded-[7px] border border-[var(--border-strong)] bg-white px-3" value={patient} onChange={(event) => setPatient(event.target.value)} maxLength={200} />
                </label>
                {category === "bpjs" ? (
                  <label className="grid gap-1 text-sm font-medium">
                    No BPJS
                    <input className="h-11 rounded-[7px] border border-[var(--border-strong)] bg-white px-3" value={bpjsNumber} onChange={(event) => setBpjsNumber(event.target.value)} maxLength={100} />
                  </label>
                ) : null}
                <label className="grid gap-1 text-sm font-medium">
                  No Resep
                  <input className="h-11 rounded-[7px] border border-[var(--border-strong)] bg-white px-3" value={prescriptionNumber} onChange={(event) => setPrescriptionNumber(event.target.value)} maxLength={100} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Asal Resep
                  <input className="h-11 rounded-[7px] border border-[var(--border-strong)] bg-white px-3" value={prescriptionOrigin} onChange={(event) => setPrescriptionOrigin(event.target.value)} maxLength={200} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Tanggal Resep
                  <input type="date" className="h-11 rounded-[7px] border border-[var(--border-strong)] bg-white px-3" value={prescriptionDate} onChange={(event) => setPrescriptionDate(event.target.value)} />
                </label>
                {prescriptionRequired ? <p className="text-xs leading-5 text-[var(--warning)]">Nama pasien dan asal resep wajib untuk barang bertanda Resep.</p> : null}
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]"></p>
            )}
          </fieldset>

          {category !== "bpjs" ? (
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Metode pembayaran</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(["cash", "qris", "bank_transfer"] as const).map((value) => (
                  <button
                    type="button"
                    aria-pressed={method === value}
                    className={`min-h-12 rounded-[7px] border-2 px-4 text-sm font-semibold ${
                      method === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-white"
                    }`}
                    key={value}
                    onClick={() => {
                      setMethod(value);
                      setError(null);
                    }}
                  >
                    {value === "cash" ? "Tunai" : value === "qris" ? "QRIS" : "Transfer Bank"}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {category === "bpjs" ? (
            <div className="mt-5 space-y-2">
              <div className="rounded-[var(--radius)] border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-900">Ditanggung BPJS</p>
                <dl className="mt-2 grid gap-1 text-sm text-blue-900">
                  <div className="flex justify-between">
                    <dt>Uang diterima</dt>
                    <dd>{formatRupiah(0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Kembalian</dt>
                    <dd>{formatRupiah(0)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : method === "cash" ? (
            <>
              <label className="mt-5 grid gap-2 text-sm font-semibold">
                Uang Diterima
                <div className="flex h-14 items-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-white px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
                  <span className="mr-2 text-zinc-500">Rp</span>
                  <input
                    className="plain-input-field tabular min-w-0 flex-1 text-xl font-semibold outline-none"
                    inputMode="numeric"
                    placeholder="0"
                    value={cash === null ? "" : cash.toLocaleString("id-ID")}
                    onChange={(event) => {
                      setCash(parseRupiahInput(event.target.value));
                      setError(null);
                    }}
                  />
                </div>
              </label>
              <div className="mt-5 flex items-end justify-between border-t border-[var(--border)] pt-4">
                <p className="text-sm font-semibold">Kembalian</p>
                <strong className="tabular text-xl">{formatRupiah(previewChange(cash, currentTotal))}</strong>
              </div>
              {cash !== null && cashValidation ? (
                <p role="alert" className="mt-4 rounded-[7px] bg-[var(--danger-soft)] p-3 text-sm font-medium text-[var(--danger)]">
                  {cashValidation}
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-[var(--radius)] border border-amber-200 bg-[var(--warning-soft)] p-4">
              <p className="font-semibold text-[var(--warning)]">Pembayaran {method === "qris" ? "QRIS" : "transfer bank"} manual</p>
              <p className="mt-1 text-sm leading-6 text-[var(--warning)]">
                Konfirmasi hanya setelah pembayaran diverifikasi secara eksternal. Transaksi akan berstatus menunggu pembayaran sampai dikonfirmasi.
              </p>
            </div>
          )}

          {prescriptionInvalid ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">Nama pasien dan asal resep wajib diisi.</p> : null}
          {bpjsInvalid ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">No BPJS wajib diisi untuk kategori BPJS.</p> : null}
          {susulanInvalid ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">Lengkapi nama obat, jumlah, dan harga untuk produk tambahan.</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-[7px] bg-[var(--danger-soft)] p-3 text-sm font-medium text-[var(--danger)]">{error}</p> : null}
          {uncertain ? (
            <div role="alert" className="mt-4 rounded-[7px] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
              <strong>Status transaksi belum dapat dipastikan.</strong>
              <p className="mt-1">Gunakan retry aman di bawah. Request ID yang sama memastikan stok tidak dipotong dua kali.</p>
            </div>
          ) : null}
        </div>
        <footer className="border-t border-[var(--border)] bg-white px-4 py-5 sm:px-6">
          <button
            className="min-h-12 w-full rounded-[7px] bg-zinc-950 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
            disabled={Boolean(cashValidation) || prescriptionInvalid || bpjsInvalid || susulanInvalid || processing}
            onClick={submit}
          >
            {processing
              ? "Memproses pembayaran…"
              : uncertain
              ? "Periksa / Coba Lagi dengan Aman"
              : category === "bpjs"
              ? "Selesaikan Transaksi BPJS"
              : method === "cash"
              ? "Bayar Tunai"
              : method === "qris"
              ? "Buat Transaksi QRIS"
              : "Buat Transaksi Transfer Bank"}
          </button>
        </footer>
      </section>
    </div>
  );
}
