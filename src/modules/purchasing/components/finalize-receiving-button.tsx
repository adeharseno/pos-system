"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
import { formatInvoiceAmount } from "../invoice-presentation";
import { formatReceivingAmount } from "../receiving-presentation";
import type { ReceivingPreview } from "../receiving-types";

export function FinalizeReceivingButton({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ReceivingPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Record<string, unknown> | null>(null);
  const url = `/api/purchase-invoices/${invoiceId}/finalize`;
  const mismatch = preview ? Number(preview.difference) !== 0 : false;
  async function load() {
    setOpen(true); setBusy(true); setError(""); setPreview(null); setAcknowledged(false); pending.current = null;
    try {
      const response = await fetch(url, { cache: "no-store" }); const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Ringkasan belum dapat dimuat.");
      setPreview(body.data);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!preview || busy || (!uncertain && mismatch && !acknowledged)) return;
    if (!pending.current) pending.current = { request_id: crypto.randomUUID(), version: preview.version, token: preview.token, acknowledge_difference: acknowledged };
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) }); const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body.error?.message ?? "Penerimaan belum dapat diselesaikan.");
        setUncertain(response.status >= 500);
        if (response.status < 500) { pending.current = null; setPreview(null); }
        return;
      }
      setUncertain(false); router.push(`/purchase-invoices/${invoiceId}?completed=1`); router.refresh();
    } catch { setUncertain(true); setError("Hasil belum dapat dipastikan. Coba kembali dengan permintaan yang sama; stok tidak akan digandakan."); }
    finally { setBusy(false); }
  }
  const close = () => { if (!busy && !uncertain) setOpen(false); };
  return <div className="space-y-3 border-t border-gray-200 pt-6"><Button type="button" disabled={disabled || busy} onClick={() => void load()}>Selesaikan Penerimaan</Button>{disabled ? <p className="text-base text-gray-600">Simpan atau batalkan isian barang sebelum menyelesaikan penerimaan.</p> : null}
    <Modal open={open} labelledBy="finalize-receiving-title" onClose={close}><ModalHeader id="finalize-receiving-title" onClose={close}>Selesaikan Penerimaan?</ModalHeader><ModalContent>
      {busy && !preview ? <p role="status">Memeriksa invoice dan harga terbaru...</p> : null}
      {preview ? <div className="space-y-5 text-base"><dl className="space-y-3">{[["Nomor Invoice",preview.invoice_number],["Pemasok",preview.supplier],["Jumlah Barang",`${preview.item_count} baris barang / batch`],["Total Pembelian Barang",formatReceivingAmount(preview.purchase_total)],["Total Invoice",formatReceivingAmount(preview.invoice_total)],["Selisih",formatReceivingAmount(preview.difference)]].map(([label,value]) => <div key={label}><dt className="text-gray-600">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
        {mismatch ? <div className="rounded-lg bg-amber-50 p-4 text-amber-900"><p className="mb-3">Total barang berbeda dengan total invoice. Nilai invoice tidak akan diubah.</p><Checkbox disabled={busy || uncertain} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} label="Saya sudah memeriksa dan menyetujui selisih ini." /></div> : null}
        <section className="space-y-3"><h3 className="text-lg font-semibold">Perubahan Harga Jual</h3><ul className="divide-y divide-gray-200">{preview.price_changes.map(line => <li key={`${line.item.product_id}-${line.target_unit_id ?? "base"}`} className="space-y-2 py-3"><p className="break-words font-medium">{line.item.product_name_snapshot} / {line.item.unit_name_snapshot}</p><p>{line.old_selling_price === null ? "Belum diatur" : formatInvoiceAmount(line.old_selling_price)} → <strong>{formatInvoiceAmount(line.item.selling_price)}</strong></p></li>)}</ul><p className="text-gray-600">Untuk produk dan satuan yang sama, harga dari perubahan barang terakhir akan dipakai.</p></section><p className="rounded-lg bg-gray-50 p-4">Stok akan bertambah dan harga terbaru akan dipakai kasir. Setelah Selesai, rincian penerimaan tidak dapat diubah.</p>
      </div> : null}
      {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
      {!preview && !busy ? <Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}>Periksa Konfirmasi Terbaru</Button> : null}
    </ModalContent><ModalFooter><Button type="button" variant="secondary" disabled={busy || uncertain} onClick={close}>Batal</Button><Button type="button" disabled={busy || !preview || (!uncertain && mismatch && !acknowledged)} onClick={() => void finish()}>{busy ? "Memproses..." : uncertain ? "Coba Kembali dengan Aman" : "Ya, Selesaikan Penerimaan"}</Button></ModalFooter></Modal>
  </div>;
}
