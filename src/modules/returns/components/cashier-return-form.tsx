"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, Checkbox, Input, Textarea } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
import { formatRupiah } from "@/modules/ui/currency";
import { amountCents, formatRefundCents, refundPreviewCents } from "../refund-preview";

export type CashierReturnItem = {
  id: string; name: string; unit: string; conversion: number; purchasedBase: number;
  returnedBase: number; remainingBase: number; purchasedUnits: number | null;
  returnedUnits: number | null; remainingUnits: number | null; exact: boolean;
  unitPrice: number; totalAmount: number; quantityInUnit: number;
  subtotalCents: string; taxCents: string; returnedSubtotalCents: string; returnedTaxCents: string;
};
type Props = { id: string; invoice: string; payment: "cash" | "qris"; items: CashierReturnItem[] };
type ReturnResult = { returnId: string; refundTotal: number };

export function CashierReturnForm({ id, invoice, payment, items }: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnResult | null>(null);
  const submitting = useRef(false);
  const selected = items.filter((item) => quantities[item.id] !== undefined);
  const valid = selected.length > 0 && reason.trim().length > 0 && selected.every((item) => {
    const value = Number(quantities[item.id]);
    const max = item.exact ? item.remainingUnits : item.remainingBase;
    const base = value * (item.exact ? item.conversion : 1);
    return Number.isSafeInteger(value) && value > 0 && max !== null && value <= max && Number.isSafeInteger(base) && base <= item.remainingBase;
  });
  // Preview uses the stored transaction line total (including its original tax).
  // The database remains the authority for the actual refund.
  const preview = valid ? selected.reduce((total, item) => total + refundPreviewCents({
    purchasedBase: item.purchasedBase, returnedBase: item.returnedBase,
    quantityBase: Number(quantities[item.id]) * (item.exact ? item.conversion : 1),
    subtotal: BigInt(item.subtotalCents), tax: BigInt(item.taxCents),
    returnedSubtotal: BigInt(item.returnedSubtotalCents), returnedTax: BigInt(item.returnedTaxCents),
  }), BigInt(0)) : null;
  const closeReview = () => { if (!busy) setReview(false); };

  async function submit() {
    if (!valid || submitting.current || uncertain || result) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "customer", transaction_id: id, refund_method: payment, reason: reason.trim(),
          items: selected.map((item) => ({ transaction_item_id: item.id, quantity_in_base: Number(quantities[item.id]) * (item.exact ? item.conversion : 1) })),
        }),
      });
      const body: { data?: ReturnResult; error?: { code?: string } } = await response.json();
      if (!response.ok || !body.data) {
        setError(body.error?.code === "NO_ACTIVE_CASH_DRAWER"
          ? "Sesi kasir belum aktif. Buka sesi kasir untuk pengembalian uang tunai."
          : body.error?.code === "RETURN_QUANTITY_EXCEEDED"
            ? "Jumlah yang tersedia telah berubah. Periksa kembali transaksi."
            : "Retur belum dapat diproses. Periksa kembali data dan coba lagi.");
        return;
      }
      setResult(body.data);
      setReview(false);
    } catch {
      setUncertain(true);
      setError("Status retur belum dapat dipastikan. Periksa riwayat transaksi sebelum mencoba kembali.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (result) return <Modal open labelledBy="return-success-title" onClose={() => router.push("/cashier/returns")}><ModalHeader id="return-success-title" onClose={() => router.push("/cashier/returns")}>Retur berhasil</ModalHeader><ModalContent><div className="grid gap-2 text-sm"><p>Faktur: {invoice}</p><p>Nomor retur: {result.returnId}</p><p>Pengembalian uang: {formatRefundCents(amountCents(result.refundTotal))}</p><p>Barang yang diretur:</p>{selected.map((item) => <p key={item.id}>{item.name}: {quantities[item.id]} {item.exact ? item.unit : "unit dasar"}</p>)}<p>Alasan: {reason}</p></div></ModalContent><ModalFooter><Link className="min-h-11 content-center rounded-[var(--radius)] bg-[var(--accent)] px-4 text-sm font-medium text-white" href="/cashier/returns">Cari transaksi lain</Link></ModalFooter></Modal>;

  return <>
    <Card>
      <CardHeader><h2 className="font-semibold">Barang pada {invoice}</h2></CardHeader>
      <CardContent className="grid gap-4">
        {items.map((item) => {
          const display = (units: number | null, base: number) => units === null ? `${base} unit dasar` : `${units} ${item.unit}`;
          const enabled = item.remainingBase > 0;
          const checked = quantities[item.id] !== undefined;
          return <div key={item.id} className="grid gap-1 border-b border-[var(--border)] pb-4 text-sm">
            <Checkbox label={item.name} className="font-semibold" checked={checked} disabled={!enabled || busy || uncertain} onChange={(event) => setQuantities((current) => { const next = { ...current }; if (event.target.checked) next[item.id] = "1"; else delete next[item.id]; return next; })} />
            <p>Unit penjualan: {item.unit}</p><p>Dibeli: {display(item.purchasedUnits, item.purchasedBase)}</p><p>Sudah diretur: {display(item.returnedUnits, item.returnedBase)}</p><p>Tersedia untuk retur: {display(item.remainingUnits, item.remainingBase)}</p>
            <p>Harga jual saat transaksi: {formatRupiah(item.unitPrice)}</p>
            {!item.remainingBase ? <p>Sudah diretur seluruhnya.</p> : !item.exact ? <p>Masukkan jumlah dalam unit dasar karena sisa tidak tepat dalam {item.unit}.</p> : null}
            {checked ? <label className="mt-2 grid gap-1">Jumlah yang diretur ({item.exact ? item.unit : "unit dasar"})<Input type="number" min={1} max={item.exact ? item.remainingUnits ?? 0 : item.remainingBase} step={1} value={quantities[item.id]} disabled={busy || uncertain} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></label> : null}
          </div>;
        })}
        {items.every((item) => item.remainingBase === 0) ? <p>Semua barang pada transaksi ini sudah diretur.</p> : null}
        <label className="grid gap-1 text-sm">Alasan retur<Textarea value={reason} disabled={busy || uncertain} onChange={(event) => setReason(event.target.value)} /></label>
        <p className="text-sm font-semibold">Perkiraan pengembalian uang: {preview === null ? "—" : formatRefundCents(preview)}</p>
        <p className="text-xs text-[var(--text-muted)]">Jumlah akhir dihitung saat retur diproses.</p>
        {error && !review ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
        <Button type="button" disabled={!valid || busy || uncertain} onClick={() => { setError(""); setReview(true); }}>Periksa Retur</Button>
      </CardContent>
    </Card>
    <Modal open={review} labelledBy="review-return-title" onClose={closeReview}>
      <ModalHeader id="review-return-title" onClose={closeReview}>Periksa Retur</ModalHeader>
      <ModalContent><div className="grid gap-2 text-sm"><p>Faktur: {invoice}</p>{selected.map((item) => <p key={item.id}>{item.name}: {quantities[item.id]} {item.exact ? item.unit : "unit dasar"}</p>)}<p>Alasan: {reason}</p><p>Pengembalian: {payment === "cash" ? "Tunai" : "QRIS"}</p><strong>Perkiraan pengembalian uang: {preview === null ? "—" : formatRefundCents(preview)}</strong><p>Jumlah akhir dihitung oleh sistem.</p>{error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : null}</div></ModalContent>
      <ModalFooter><Button type="button" variant="secondary" disabled={busy} onClick={closeReview}>Batal</Button><Button type="button" disabled={busy || uncertain || !valid} onClick={submit}>{busy ? "Memproses…" : "Konfirmasi Retur"}</Button></ModalFooter>
    </Modal>
  </>;
}
