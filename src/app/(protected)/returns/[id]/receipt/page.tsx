import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/application/auth-service";
import { getReturnDetail } from "@/modules/returns/data/return-queries";
import { formatReceiptDate, RECEIPT_PHARMACY_ADDRESS } from "@/modules/sales/receipt";
import { formatRupiah } from "@/modules/ui/currency";
import { requireUuid } from "@/modules/shared/validation/input";
import { PrintReceiptButton } from "@/modules/sales/components/print-receipt-button";

export default async function ReturnReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("returns.view");
  const { id } = await params;
  let returnId: string;
  try {
    returnId = requireUuid(id, "returnId");
  } catch {
    notFound();
  }

  const detail = await getReturnDetail(returnId);
  if (!detail) notFound();

  return (
    <main className="receipt-page min-h-screen px-4 py-6 sm:px-6">
      <div className="receipt-actions mx-auto mb-4 flex w-full max-w-[360px] flex-wrap gap-2">
        <Link
          className="flex min-h-11 flex-1 items-center justify-center rounded-[7px] border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
          href={`/returns/${detail.id}`}
        >
          ← Kembali ke Detail Retur
        </Link>
        <PrintReceiptButton />
      </div>

      <article className="receipt-document mx-auto w-full max-w-[360px] bg-white px-3.5 py-4 text-black shadow-sm leading-[1.25]">
        <header className="text-center">
          <h1 className="receipt-title text-[12px] font-bold tracking-[.06em] leading-tight text-black">
            APOTEK CIPAYUNG FARMA
          </h1>
          <div className="receipt-address mt-0.5 text-[8.5px] font-medium leading-tight text-black">
            {RECEIPT_PHARMACY_ADDRESS.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <div className="mt-2 border-y border-dashed border-zinc-400 py-1.5">
            <p className="text-[10px] font-bold tracking-wider text-black">NOTA RETUR PENJUALAN</p>
            <p className="font-mono text-[10px] font-bold text-black">{detail.returnNumber || "(DRAFT RETUR)"}</p>
          </div>

          <div className="mt-1.5 grid gap-0.5 text-left text-[8.5px] font-medium text-black">
            <div className="flex justify-between">
              <span>Faktur Asli:</span>
              <span className="font-bold">{detail.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Tanggal Retur:</span>
              <span>{formatReceiptDate(detail.reviewedAt || detail.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kasir Pengaju:</span>
              <span>{detail.cashierName}</span>
            </div>
            {detail.reviewerName ? (
              <div className="flex justify-between">
                <span>Disetujui Oleh:</span>
                <span>{detail.reviewerName}</span>
              </div>
            ) : null}
          </div>
        </header>

        {/* Items Section */}
        <section className="mt-2 border-t border-dashed border-zinc-400 pt-2">
          <p className="text-[8.5px] font-bold uppercase tracking-wider text-black mb-1">Daftar Barang Diretur:</p>
          <ul className="divide-y divide-zinc-200">
            {detail.items.map((it) => (
              <li key={it.id} className="py-1 text-[8.5px]">
                <div className="flex justify-between font-semibold">
                  <span>{it.productName}</span>
                  <span className="tabular">{formatRupiah(it.refundTotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>
                    {it.quantityInUnit} {it.unitName} × {formatRupiah(it.unitPrice)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Financial Summary */}
        <section className="mt-2 border-t border-dashed border-zinc-400 pt-2 text-[9px]">
          <div className="flex justify-between">
            <span>Subtotal Refund:</span>
            <span className="tabular">{formatRupiah(detail.refundSubtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-zinc-300 pt-1 text-[10.5px] font-bold">
            <span>Total Nilai Retur:</span>
            <span className="tabular">{formatRupiah(detail.refundTotal)}</span>
          </div>
          {detail.transactionPaymentMethod === "tempo" || detail.receivableCreditAmount > 0 ? (
            <>
              <div className="mt-1 flex justify-between text-[8px] text-zinc-700">
                <span>Pengurang Sisa Piutang:</span>
                <span className="font-semibold tabular">{formatRupiah(detail.receivableCreditAmount)}</span>
              </div>
              <div className="flex justify-between text-[8px] text-zinc-700">
                <span>Kelebihan Refund Dana:</span>
                <span className="font-semibold tabular">{formatRupiah(detail.cashRefundAmount)}</span>
              </div>
            </>
          ) : null}
          <div className="mt-1 flex justify-between text-[8px] text-zinc-700">
            <span>Metode Pengembalian:</span>
            <span className="font-semibold uppercase">{detail.refundMethod}</span>
          </div>
          <div className="flex justify-between text-[8px] text-zinc-700">
            <span>Status Refund:</span>
            <span className="font-semibold">
              {detail.refundStatus === "completed" ? "SUDAH DIBAYARKAN" : "MENUNGGU DIBAYARKAN"}
            </span>
          </div>
        </section>

        {/* Reason & Notes */}
        <footer className="mt-3 border-t border-dashed border-zinc-400 pt-2 text-[8px] text-zinc-700">
          <p>
            <strong>Alasan Retur:</strong> {detail.reason}
          </p>
          {detail.adminNotes ? (
            <p className="mt-0.5">
              <strong>Catatan Admin:</strong> {detail.adminNotes}
            </p>
          ) : null}

          {/* Signatures */}
          <div className="mt-5 grid grid-cols-2 text-center text-[7.5px]">
            <div>
              <p>Penerima Refund</p>
              <div className="h-10"></div>
              <p className="border-t border-dashed border-zinc-400 pt-0.5">( ........................ )</p>
            </div>
            <div>
              <p>Petugas Apotek</p>
              <div className="h-10"></div>
              <p className="border-t border-dashed border-zinc-400 pt-0.5">({detail.cashierName})</p>
            </div>
          </div>
        </footer>
      </article>
    </main>
  );
}

