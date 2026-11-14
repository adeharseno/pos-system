"use client";
import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { formatRupiah } from "@/modules/ui/currency";
import { formatIndonesianDate } from "@/modules/ui/date";
import type { CheckoutResult, PaymentMethod } from "../types";
import { AutoPrintReceipt } from "./auto-print-receipt";
import { consumeCashierKeyboardAction, isEditableKeyboardTarget } from "../cashier-keyboard";

export function CheckoutSuccess({
  result,
  paymentMethod = "cash",
  onNewSale,
}: {
  result: CheckoutResult & { cashReceived?: number };
  paymentMethod?: PaymentMethod;
  onNewSale: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const actionLock = useRef(false);
  const isTempo = paymentMethod === "tempo";
  const paymentMethodLabel =
    paymentMethod === "cash"
      ? "Tunai"
      : paymentMethod === "qris"
      ? "QRIS"
      : paymentMethod === "bank_transfer"
      ? "Transfer Bank"
      : paymentMethod === "tempo"
      ? "TEMPO"
      : "Ditanggung BPJS";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/40 p-4" onKeyDown={(event:KeyboardEvent<HTMLDivElement>)=>{
      const action=consumeCashierKeyboardAction(event,"success",isEditableKeyboardTarget(event.target));
      if(!action)return;
      event.stopPropagation();
      if(actionLock.current)return;
      if(action==="new-sale"){actionLock.current=true;onNewSale();}
      else if(action==="print-receipt")dialogRef.current?.querySelector<HTMLButtonElement>('[data-receipt-print-action="true"]')?.click();
      else if(action==="view-receipt")dialogRef.current?.querySelector<HTMLAnchorElement>('[data-receipt-view-action="true"]')?.click();
    }}>
      <section
        ref={dialogRef}
        aria-labelledby="success-title"
        aria-modal="true"
        role="dialog"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[10px] bg-white p-6 text-center shadow-2xl"
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--success-soft)] text-xl font-bold text-[var(--success)]">
          ✓
        </span>
        <h2 className="mt-4 text-xl font-semibold" id="success-title">
          Transaksi Berhasil
        </h2>
        <p className="tabular mt-1 text-sm font-semibold text-[var(--accent)]">{result.invoiceNumber}</p>
        <dl className="mt-6 divide-y divide-[var(--border)] text-sm">
          <div className="flex justify-between py-3">
            <dt className="text-[var(--text-muted)]">Total</dt>
            <dd className="tabular font-semibold">{formatRupiah(result.totalAmount)}</dd>
          </div>
          {paymentMethod === "cash" || paymentMethod === "bpjs" ? (
            <>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Uang diterima</dt>
                <dd className="tabular font-semibold">{formatRupiah(result.cashReceived ?? 0)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Kembalian</dt>
                <dd className="tabular text-lg font-bold">{formatRupiah(result.cashChange ?? 0)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between py-3">
            <dt className="text-[var(--text-muted)]">Metode pembayaran</dt>
            <dd className="font-semibold">{paymentMethodLabel}</dd>
          </div>
          {isTempo ? (
            <>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Pembeli</dt>
                <dd className="font-semibold">{result.customerName ?? "-"}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Jatuh Tempo</dt>
                <dd className="font-semibold">{formatIndonesianDate(result.dueDate)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Status Pembayaran</dt>
                <dd className="font-semibold text-[var(--warning)]">BELUM LUNAS</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-[var(--text-muted)]">Sisa Tagihan</dt>
                <dd className="tabular font-bold text-zinc-950">{formatRupiah(result.totalAmount)}</dd>
              </div>
            </>
          ) : paymentMethod !== "cash" ? (
            <div className="flex justify-between py-3">
              <dt className="text-[var(--text-muted)]">Status</dt>
              <dd className="font-semibold text-[var(--success)]">
                {paymentMethod === "bpjs" ? "Ditanggung BPJS" : "Pembayaran dikonfirmasi"}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-6 grid gap-2">
          <AutoPrintReceipt
            transactionId={result.transactionId}
            label={isTempo ? "Cetak Invoice" : undefined}
          />
          <Link
            data-receipt-view-action="true"
            className="flex min-h-12 items-center justify-center rounded-[7px] border border-[var(--border-strong)] px-4 text-sm font-semibold"
            href={`/transactions/${result.transactionId}/receipt`}
          >
            {isTempo ? "Lihat Invoice" : "Lihat Struk"}
          </Link>
          <button
            autoFocus
            className="min-h-12 w-full rounded-[7px] bg-zinc-950 px-4 text-sm font-semibold text-white"
            onClick={onNewSale}
          >
            Transaksi Baru
          </button>
        </div>
      </section>
    </div>
  );
}
