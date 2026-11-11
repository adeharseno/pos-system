import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getReceiptTransaction } from "@/modules/sales/data/transaction-queries";
import { getSusulanItemsForTransaction } from "@/modules/sales/data/bpjs-susulan-queries";
import { buildReceiptViewModel, formatPrescriptionDate, formatReceiptDate, RECEIPT_PHARMACY_ADDRESS, resolveReceiptTotals, sanitizeReceiptProductName, type ReceiptTransactionRow } from "@/modules/sales/receipt";
import { PrintReceiptButton } from "@/modules/sales/components/print-receipt-button";
import { formatRupiah } from "@/modules/ui/currency";
import { requireUuid } from "@/modules/shared/validation/input";

const value = (text: string | undefined) => text || "-";
const paymentName = (method: "cash" | "qris" | "bank_transfer" | "bpjs") => method === "cash" ? "TUNAI" : method === "qris" ? "QRIS" : method === "bank_transfer" ? "TRANSFER BANK" : "DITANGGUNG BPJS";
const statusDisplay = (status: "completed" | "pending_payment" | "voided") => status === "completed" ? "LUNAS" : status === "pending_payment" ? "BELUM LUNAS" : "DIBATALKAN";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePosOperator(); const { id } = await params; let transactionId;
  try { transactionId = requireUuid(id, "transactionId"); } catch { notFound(); }
  const [row, susulanItems] = await Promise.all([
    getReceiptTransaction(transactionId),
    getSusulanItemsForTransaction(transactionId).catch(() => []),
  ]);
  if (!row) notFound();
  const receipt = buildReceiptViewModel(row as unknown as ReceiptTransactionRow);
  const statusLabel = statusDisplay(receipt.status);

  // Combine regular items and susulan items without any special label or suffix
  const allItems = [
    ...receipt.items.map((item) => ({
      ...item,
      productName: sanitizeReceiptProductName(item.productName),
    })),
    ...susulanItems.map((item) => ({
      productName: sanitizeReceiptProductName(item.drugName),
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  const {
    subtotal: finalSubtotal,
    taxAmount: finalTaxAmount,
    total: finalTotal,
  } = resolveReceiptTotals(receipt, susulanItems);

  return <main className="receipt-page min-h-screen px-4 py-6 sm:px-6">
    <div className="receipt-actions mx-auto mb-4 flex w-full max-w-[360px] flex-wrap gap-2"><Link className="flex min-h-11 flex-1 items-center justify-center rounded-[7px] border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold" href="/cashier">Kembali ke Kasir</Link><PrintReceiptButton /></div>
    <article className="receipt-document mx-auto w-full max-w-[360px] bg-white px-3.5 py-3 text-black shadow-sm leading-[1.25]">
      <header className="text-center">
        <h1 className="receipt-title text-[11.5px] font-bold tracking-[.06em] leading-tight text-black">APOTEK CIPAYUNG FARMA</h1>
        <div className="receipt-address mt-0.5 text-[8.5px] font-medium leading-tight text-black">{RECEIPT_PHARMACY_ADDRESS.map(line => <p key={line}>{line}</p>)}</div>
        <p className="receipt-invoice mt-1.5 break-all font-mono text-[9.5px] font-bold leading-tight text-black">{receipt.invoiceNumber}</p>
        <p className="receipt-meta mt-0.5 text-[8.5px] font-medium text-black leading-tight">{formatReceiptDate(receipt.createdAt)}</p>
        <p className="receipt-meta mt-0.5 text-[8.5px] font-medium text-black leading-tight">Kasir: {receipt.cashierName}</p>
      </header>
      {receipt.prescription.category !== "bebas" ? (
        <dl className="receipt-section mt-2 grid gap-0.5 border-t border-dashed border-zinc-400 py-1.5 text-[8.5px] leading-tight text-black">
          <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">Kategori RESEP</dt><dd className="font-semibold">{receipt.prescription.category.toUpperCase()}</dd></div>
          <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">Nama Pasien</dt><dd className="break-words font-medium">{value(receipt.prescription.patientName)}</dd></div>
          {receipt.prescription.category === "bpjs" ? <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">No BPJS</dt><dd className="break-all font-medium">{value(receipt.prescription.bpjsNumber)}</dd></div> : null}
          <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">No Resep</dt><dd className="break-all font-medium">{value(receipt.prescription.prescriptionNumber)}</dd></div>
          <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">Asal Resep</dt><dd className="break-words font-medium">{value(receipt.prescription.prescriptionOrigin)}</dd></div>
          <div className="flex gap-2"><dt className="receipt-dt w-24 shrink-0 font-medium">TGL Resep</dt><dd className="font-medium">{receipt.prescription.prescriptionDate ? formatPrescriptionDate(receipt.prescription.prescriptionDate) : "-"}</dd></div>
        </dl>
      ) : (
        <p className="receipt-section mt-2 border-t border-dashed border-zinc-400 py-1.5 text-center text-[8.5px] font-semibold leading-tight text-black">KATEGORI BEBAS</p>
      )}
      {receipt.status === "pending_payment" ? (
        <div className="receipt-notice border-t border-dashed border-zinc-400 py-1.5 text-center text-[9px] leading-tight text-black">
          <p className="font-bold text-amber-900 print:text-black">INVOICE PEMBAYARAN</p>
          <p className="mt-0.5 text-[8.5px] font-medium text-black">Status: BELUM LUNAS</p>
          <p className="receipt-notice-sub mt-0.5 text-[8px] font-medium text-black">Dokumen ini adalah tagihan pembayaran {paymentName(receipt.paymentMethod)}, bukan bukti lunas.</p>
        </div>
      ) : null}
      {receipt.status === "voided" ? (
        <div className="border-t border-zinc-900 py-1 text-center text-[9px] font-bold leading-tight text-black">TRANSAKSI DIBATALKAN</div>
      ) : null}
      <section aria-label="Item transaksi" className="divide-y divide-dashed divide-zinc-300 border-y border-dashed border-zinc-400">
        {allItems.map((item, index) => (
          <div className="py-0.5 text-[9.5px] leading-tight text-black" key={index}>
            <div className="flex justify-between gap-2 items-baseline">
              <p className="receipt-item-title min-w-0 font-semibold break-words text-black">{item.productName}</p>
              <p className="receipt-item-price tabular shrink-0 font-semibold text-black">{formatRupiah(item.lineTotal)}</p>
            </div>
            <p className="receipt-item-detail tabular mt-0.5 text-[8.5px] font-semibold text-black">
              {item.quantity} {item.unitName} × {formatRupiah(item.unitPrice)}
            </p>
          </div>
        ))}
      </section>
      <dl className="receipt-section mt-2 grid gap-0.5 text-[8.5px] leading-tight text-black">
        <div className="flex justify-between"><dt className="font-medium">Subtotal</dt><dd className="tabular font-medium">{formatRupiah(finalSubtotal)}</dd></div>
        {finalTaxAmount > 0 ? <div className="flex justify-between"><dt className="font-medium">Pajak</dt><dd className="tabular font-medium">{formatRupiah(finalTaxAmount)}</dd></div> : null}
        <div className="mt-1 flex justify-between border-t border-zinc-900 pt-1 text-[11.5px] font-bold leading-tight text-black">
          <dt className="receipt-total">TOTAL</dt>
          <dd className="receipt-total tabular">{formatRupiah(finalTotal)}</dd>
        </div>
        <div className="flex justify-between"><dt className="font-medium">Pembayaran</dt><dd className="font-semibold">{receipt.paymentMethod === "bpjs" ? "DITANGGUNG BPJS" : paymentName(receipt.paymentMethod)}</dd></div>
        {(receipt.paymentMethod === "cash" || receipt.paymentMethod === "bpjs") && receipt.cashReceived !== undefined ? (
          <>
            <div className="flex justify-between"><dt className="font-medium">{receipt.paymentMethod === "cash" ? "TUNAI" : "UANG DITERIMA"}</dt><dd className="tabular font-medium">{formatRupiah(receipt.cashReceived)}</dd></div>
            <div className="flex justify-between"><dt className="font-medium">KEMBALI</dt><dd className="tabular font-medium">{formatRupiah(receipt.cashChange ?? 0)}</dd></div>
          </>
        ) : null}
        <div className="flex justify-between"><dt className="font-medium">Status</dt><dd className={`font-bold ${receipt.status === "voided" ? "text-red-700 print:text-black" : receipt.status === "pending_payment" ? "text-amber-800 print:text-black" : "text-black"}`}>{statusLabel}</dd></div>
      </dl>
      <footer className="receipt-footer mt-2.5 border-t border-dashed border-zinc-400 pt-1.5 text-center text-[8px] font-medium text-black leading-tight">
        <p>Terima kasih.</p>
      </footer>
    </article>
  </main>;
}
