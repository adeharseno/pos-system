"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Label, Textarea } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
import { formatRupiah } from "@/modules/ui/currency";
import { checkoutErrorMessage } from "../checkout-ui";
import type { TransactionStatus } from "../transaction-history-filters";

type Props = { transactionId: string; invoice: string; total: number; status: TransactionStatus; canConfirm: boolean; canVoid: boolean };
type ResponseBody = { ok?: boolean; data?: { status?: TransactionStatus }; error?: { code?: string } };

export function TransactionActions({ transactionId, invoice, total, status, canConfirm, canVoid }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"confirm" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const close = () => { if (!inFlight.current) setMode(null); };

  async function checkStatus() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, { cache: "no-store" });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.ok || !body.data?.status) throw new Error();
      if (body.data.status !== status) setDone(true);
      setUncertain(false);
      setMessage(body.data.status === "voided" ? "Transaksi sudah dibatalkan." : body.data.status === "completed" ? "Transaksi sudah selesai." : "Pembayaran masih menunggu konfirmasi.");
      router.refresh();
    } catch { setError("Status belum dapat diperiksa. Periksa koneksi, lalu coba lagi."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function submit() {
    if (!mode || inFlight.current || uncertain || done || (mode === "void" && !reason.trim())) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/transactions/${transactionId}/${mode === "confirm" ? "confirm-payment" : "void"}`, {
        method: "POST",
        ...(mode === "void" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) } : {}),
      });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.ok || body.data?.status !== (mode === "confirm" ? "completed" : "voided")) {
        const code = body.error?.code;
        if (response.status >= 500 || (response.ok && body.ok) || code === "QRIS_ALREADY_CONFIRMED" || code === "TRANSACTION_ALREADY_VOIDED" || code === "INVALID_TRANSACTION_STATE") {
          setUncertain(true); setMode(null);
        }
        const messages: Record<string, string> = {
          TRANSACTION_HAS_RETURNS: "Transaksi sudah memiliki retur dan tidak dapat dibatalkan.",
          TRANSACTION_ALREADY_VOIDED: "Transaksi sudah dibatalkan. Periksa status terbaru.",
          FORBIDDEN: "Akun Anda tidak memiliki akses untuk tindakan ini.",
          UNAUTHENTICATED: "Sesi masuk berakhir. Silakan masuk kembali.",
          VOID_REASON_REQUIRED: "Isi alasan pembatalan.",
        };
        setError(messages[code ?? ""] ?? checkoutErrorMessage(code ?? "UNKNOWN"));
        return;
      }
      setDone(true); setMode(null);
      setMessage(mode === "confirm" ? "Pembayaran berhasil dikonfirmasi." : "Transaksi berhasil dibatalkan.");
      router.refresh();
    } catch {
      setMode(null); setUncertain(true);
      setError("Hasil tindakan belum dapat dipastikan. Periksa status sebelum mencoba kembali.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (!canConfirm && !canVoid && !message && !error) return null;
  return <div className="space-y-4">
    {message ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-base text-emerald-900">{message}</p> : null}
    {error && !mode ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
    {uncertain ? <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={checkStatus}>{busy ? "Memeriksa..." : "Periksa Status"}</Button> : null}
    {!done ? <div className="grid gap-3">
      {canConfirm ? <Button type="button" disabled={busy || uncertain} onClick={() => { setError(""); setMode("confirm"); }}>Konfirmasi Pembayaran</Button> : null}
      {canVoid ? <Button type="button" variant="secondary" className="border-red-300! text-red-800! hover:bg-red-50!" disabled={busy || uncertain} onClick={() => { setError(""); setMode("void"); }}>Batalkan Transaksi</Button> : null}
    </div> : null}
    <Modal open={mode !== null} labelledBy="transaction-action-title" onClose={close}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <ModalHeader id="transaction-action-title" onClose={close}>{mode === "void" ? "Batalkan transaksi?" : "Konfirmasi pembayaran?"}</ModalHeader>
        <ModalContent>
          <p className="break-all text-base font-semibold text-gray-900">{invoice}</p>
          <p className="mt-2 text-xl font-semibold tabular">{formatRupiah(total)}</p>
          <p className="my-5 text-base text-gray-700">{mode === "void" ? "Transaksi akan dibatalkan dan stok barang dikembalikan." : "Pastikan pembayaran QRIS sudah diterima."}</p>
          {mode === "void" ? <FormField><Label htmlFor="transaction-void-reason">Alasan pembatalan</Label><Textarea id="transaction-void-reason" value={reason} onChange={event => setReason(event.target.value)} required disabled={busy} autoFocus /></FormField> : null}
          {error ? <p role="alert" className="mt-4 text-base text-red-800">{error}</p> : null}
        </ModalContent>
        <ModalFooter><Button type="button" variant="secondary" onClick={close} disabled={busy}>Kembali</Button><Button type="submit" variant={mode === "void" ? "danger" : "primary"} disabled={busy || (mode === "void" && !reason.trim())}>{busy ? "Memproses..." : mode === "void" ? "Ya, Batalkan" : "Ya, Konfirmasi"}</Button></ModalFooter>
      </form>
    </Modal>
  </div>;
}
