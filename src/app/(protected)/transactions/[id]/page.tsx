import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/application/auth-service";
import { getCustomerReturns, getTransaction } from "@/modules/sales/data/transaction-queries";
import { resolveTransactionDisplayStatus } from "@/modules/sales/transaction-history-filters";
import { getSusulanItemsForTransaction } from "@/modules/sales/data/bpjs-susulan-queries";
import { buildReceiptViewModel, formatPrescriptionDate, formatReceiptDate, resolveReceiptTotals, type ReceiptTransactionRow } from "@/modules/sales/receipt";
import { TransactionActions } from "@/modules/sales/components/transaction-actions";
import { AutoPrintReceipt } from "@/modules/sales/components/auto-print-receipt";
import { FulfillSusulanButton } from "@/modules/sales/components/fulfill-susulan-button";
import { paymentLabel, TransactionStatusBadge, transactionLinkClass } from "@/modules/sales/components/transaction-presentation";
import { transactionActionVisibility, transactionPrintLabel } from "@/modules/sales/transaction-detail-ui";
import { requireUuid } from "@/modules/shared/validation/input";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";
import { returnQuantity } from "@/modules/returns/return-quantity";
import { canStartReturn, detailReturnState } from "@/modules/returns/return-detail-state";

type ReturnItem = { transaction_item_id: string; quantity_in_base: number };
type ReturnRecord = {
  id: string;
  return_number?: string | null;
  status?: string;
  refund_status?: string;
  reason?: string;
  admin_notes?: string | null;
  refund_total?: number;
  created_at?: string;
  employees?: { full_name: string } | null;
  return_items: ReturnItem[] | null;
};
type DetailItem = { id: string; quantity_in_base: number; conversion_to_base_snapshot: number };

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requirePermission("transactions.view");
  const canManagePayments = employee.role === "owner_admin";
  const { id } = await params;
  let transactionId: string;
  try { transactionId = requireUuid(id, "transactionId"); } catch { notFound(); }
  const [row, records, susulanItems] = await Promise.all([
    getTransaction(transactionId),
    getCustomerReturns(transactionId) as Promise<ReturnRecord[]>,
    getSusulanItemsForTransaction(transactionId).catch(() => []),
  ]);
  if (!row) notFound();
  const transaction = buildReceiptViewModel(row as unknown as ReceiptTransactionRow);
  const summaryTotals = resolveReceiptTotals(transaction, susulanItems);
  const returned = new Map<string, number>();
  for (const record of records) {
    if (record.status !== "rejected") {
      for (const item of record.return_items ?? []) {
        returned.set(item.transaction_item_id, (returned.get(item.transaction_item_id) ?? 0) + item.quantity_in_base);
      }
    }
  }
  const quantities = (row.transaction_items as DetailItem[]).map(item => ({ id: item.id, source: item, ...returnQuantity({ purchasedBase: item.quantity_in_base, returnedBase: returned.get(item.id) ?? 0, conversionToBase: item.conversion_to_base_snapshot }) }));
  const state = detailReturnState(quantities.map(item => ({ purchasedBase: item.source.quantity_in_base, returnedBase: returned.get(item.id) ?? 0, conversionToBase: item.source.conversion_to_base_snapshot, remainingBase: item.remainingBase })));
  const actions = transactionActionVisibility(transaction.status, row.payment_method, records.length > 0);
  const pendingSusulan = susulanItems.filter(item => item.fulfillmentStatus === "pending_fulfillment");

  const displayStatus = resolveTransactionDisplayStatus(row.status, row.payment_method, pendingSusulan.length > 0);

  return <Container size="xl" className="space-y-7">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-gray-900">Detail Transaksi</h1><Link href="/transactions" className={transactionLinkClass}>Kembali ke Transaksi</Link></header>

    {pendingSusulan.length > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-800">!</span>
          <div>
            <p className="font-semibold text-amber-950">Barang Belum Lengkap</p>
            <p className="text-sm text-amber-900">
              Terdapat {pendingSusulan.length} produk tambahan yang belum diserahkan. Janji penyerahan: {formatReceiptDate(pendingSusulan[0].deliveryDate)}.
            </p>
          </div>
        </div>
      </div>
    ) : null}

    <Card><CardHeader><h2 className="text-lg font-semibold text-gray-900">Informasi Transaksi</h2></CardHeader><CardContent>
      <dl className="grid gap-6 text-base sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-gray-600">Nomor transaksi</dt><dd className="mt-2 break-all font-semibold text-gray-900">{transaction.invoiceNumber}</dd></div>
        <div><dt className="text-gray-600">Tanggal dan waktu</dt><dd className="mt-2 text-gray-900">{formatReceiptDate(transaction.createdAt)}</dd></div>
        <div><dt className="text-gray-600">Kasir</dt><dd className="mt-2 break-words text-gray-900">{transaction.cashierName}</dd></div>
        <div><dt className="text-gray-600">Status</dt><dd className="mt-2"><TransactionStatusBadge status={displayStatus} /></dd></div>
      </dl>
      {state === "partial" ? (
        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-5">
          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Retur Sebagian
          </span>
          <span className="text-sm text-gray-600">Sebagian barang pada transaksi ini sudah diretur.</span>
        </div>
      ) : state === "full" ? (
        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-5">
          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            Retur Penuh
          </span>
          <span className="text-sm text-gray-600">Semua barang pada transaksi ini sudah diretur.</span>
        </div>
      ) : null}
    </CardContent></Card>
    <Card><CardHeader><h2 className="text-lg font-semibold text-gray-900">Informasi Resep</h2></CardHeader><CardContent>{transaction.prescription.category==="bebas"?<p className="text-base font-medium">Kategori BEBAS — tanpa data pasien atau resep.</p>:<dl className="grid gap-6 text-base sm:grid-cols-2 xl:grid-cols-3"><div><dt className="text-gray-600">Kategori Resep</dt><dd className="mt-2 font-semibold">{transaction.prescription.category.toUpperCase()}</dd></div><div><dt className="text-gray-600">Nama Pasien</dt><dd className="mt-2 break-words">{transaction.prescription.patientName||"-"}</dd></div>{transaction.prescription.category==="bpjs"?<div><dt className="text-gray-600">No BPJS</dt><dd className="mt-2 break-all">{transaction.prescription.bpjsNumber||"-"}</dd></div>:null}<div><dt className="text-gray-600">No Resep</dt><dd className="mt-2 break-all">{transaction.prescription.prescriptionNumber||"-"}</dd></div><div><dt className="text-gray-600">Asal Resep</dt><dd className="mt-2 break-words">{transaction.prescription.prescriptionOrigin||"-"}</dd></div><div><dt className="text-gray-600">Tanggal Resep</dt><dd className="mt-2">{transaction.prescription.prescriptionDate?formatPrescriptionDate(transaction.prescription.prescriptionDate):"-"}</dd></div></dl>}</CardContent></Card>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card className="min-w-0"><CardHeader><h2 className="text-lg font-semibold text-gray-900">Barang yang Dibeli</h2></CardHeader>
        <ul className="divide-y divide-gray-200">{transaction.items.map((item, index) => {
          const q = quantities[index];
          const baseReturned = returned.get(q.id) ?? 0;
          return <li key={q.id} className="space-y-3 px-5 py-6 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4"><h3 className="min-w-0 flex-1 break-words text-base font-semibold text-gray-900">{item.productName}</h3><p className="break-words text-base font-semibold text-gray-900 tabular">{formatRupiah(item.lineTotal)}</p></div>
            <p className="text-base text-gray-700">{item.quantity} {item.unitName} × {formatRupiah(item.unitPrice)}</p>
            {baseReturned > 0 ? <p className="text-sm text-gray-600">Dibeli {q.purchasedUnits ?? q.source.quantity_in_base} {q.exact ? item.unitName : "unit dasar"} · Diretur {q.returnedUnits ?? baseReturned} · Sisa {q.remainingUnits ?? q.remainingBase}</p> : null}
            {q.remainingBase === 0 ? <p className="text-base font-medium text-gray-700">Sudah diretur seluruhnya</p> : null}
            {row.payment_method === "bpjs" ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <span className="size-2 rounded-full bg-emerald-600"></span>
                Sudah diserahkan ({item.quantity} {item.unitName}) · Diserahkan saat checkout
              </p>
            ) : null}
          </li>;
        })}
        {susulanItems.map((item) => (
          <li key={item.id} className="space-y-3 bg-blue-50/20 px-5 py-6 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-base font-semibold text-gray-900">{item.drugName} (Produk Tambahan)</h3>
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    Produk Tambahan
                  </span>
                </div>
              </div>
              <p className="break-words text-base font-semibold text-gray-900 tabular">{formatRupiah(item.lineTotal)}</p>
            </div>
            <p className="text-base text-gray-700">{item.quantity} unit × {formatRupiah(item.unitPrice)}</p>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div>
                {item.fulfillmentStatus === "completed" ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <span className="size-2 rounded-full bg-emerald-600"></span>
                    Sudah diserahkan ({item.quantity} unit) {item.fulfilledAt ? `· ${formatReceiptDate(item.fulfilledAt)}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800">
                    <span className="size-2 rounded-full bg-amber-500"></span>
                    Belum diserahkan ({item.quantity} unit) · Janji penyerahan: {formatReceiptDate(item.deliveryDate)}
                  </span>
                )}
              </div>
              {item.fulfillmentStatus === "pending_fulfillment" && canManagePayments ? (
                <FulfillSusulanButton
                  transactionId={transactionId}
                  susulanId={item.id}
                  drugName={item.drugName}
                  quantity={item.quantity}
                />
              ) : null}
            </div>
          </li>
        ))}
        </ul>
      </Card>
      <Card className="min-w-0"><CardHeader><h2 className="text-lg font-semibold text-gray-900">Pembayaran</h2></CardHeader><CardContent className="space-y-6">
        <dl className="space-y-4 text-base">
          <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Metode pembayaran</dt><dd className="font-medium text-gray-900">{paymentLabel(row.payment_method)}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Subtotal</dt><dd className="font-medium tabular">{formatRupiah(summaryTotals.subtotal)}</dd></div>
          {summaryTotals.taxAmount > 0 ? <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Pajak</dt><dd className="font-medium tabular">{formatRupiah(summaryTotals.taxAmount)}</dd></div> : null}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5 text-xl font-semibold"><dt>Total pembayaran</dt><dd className="break-words tabular">{formatRupiah(summaryTotals.total)}</dd></div>
          {transaction.paymentMethod === "cash" || transaction.paymentMethod === "bpjs" ? <>
            <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Uang diterima</dt><dd className="tabular">{formatRupiah(transaction.cashReceived ?? 0)}</dd></div>
            <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Kembalian</dt><dd className="tabular">{formatRupiah(transaction.cashChange ?? 0)}</dd></div>{transaction.paymentMethod === "bpjs" ? <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Status pembayaran</dt><dd className="font-medium">Ditanggung BPJS</dd></div> : null}
          </> : <div><dt className="text-gray-600">Status pembayaran</dt><dd className={`mt-2 font-medium ${transaction.status === "pending_payment" ? "text-amber-800" : ""}`}>{transaction.status === "completed" ? "Sudah dikonfirmasi" : transaction.status === "voided" ? "Transaksi dibatalkan" : "MENUNGGU PEMBAYARAN"}</dd></div>}
        </dl>
        <div className="grid gap-3 border-t border-gray-200 pt-6">
          <AutoPrintReceipt transactionId={transaction.transactionId} label={transactionPrintLabel(transaction.status, row.payment_method)} autoPrint={false} />
          <Link href={`/transactions/${transaction.transactionId}/receipt`} className={`${transactionLinkClass} w-full`}>Lihat {transaction.status === "pending_payment" ? "Invoice" : "Struk"} di Tab Baru</Link>
          {canStartReturn(transaction.status, state) ? <Link href={`/transactions/${transaction.transactionId}/return`} className={`${transactionLinkClass} w-full`}>Request Retur Barang</Link> : null}
          <TransactionActions transactionId={transaction.transactionId} invoice={transaction.invoiceNumber} total={summaryTotals.total} status={transaction.status} paymentMethod={row.payment_method} canConfirm={canManagePayments && actions.confirm} canVoid={canManagePayments && actions.void} />
        </div>
      </CardContent></Card>
    </div>

    {records.length > 0 ? (
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Riwayat Pengajuan Retur</h2>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-gray-200">
            {records.map((rec) => {
              const status = rec.status ?? "completed";
              const isRejected = status === "rejected";
              const isPending = status === "pending_approval";
              const isApproved = status === "approved";
              const isCompleted = status === "completed";

              const badgeColor = isPending
                ? "bg-amber-100 text-amber-800"
                : isApproved
                ? "bg-blue-100 text-blue-800"
                : isCompleted
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800";

              const statusText = isPending
                ? "Menunggu Persetujuan Admin"
                : isApproved
                ? "Disetujui Admin"
                : isCompleted
                ? "Selesai (Refund Selesai)"
                : "Ditolak";

              return (
                <li key={rec.id} className="py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
                        {statusText}
                      </span>
                      {rec.return_number ? (
                        <strong className="text-sm text-gray-900">{rec.return_number}</strong>
                      ) : null}
                      {rec.created_at ? (
                        <span className="text-xs text-gray-500">{formatReceiptDate(rec.created_at)}</span>
                      ) : null}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular">
                      {formatRupiah(rec.refund_total ?? 0)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700">
                    <span className="text-gray-500">Alasan Kasir:</span> {rec.reason || "-"}
                  </p>

                  {rec.admin_notes ? (
                    <div className={`rounded-lg p-3 text-sm ${isRejected ? "bg-red-50 text-red-900 border border-red-200" : "bg-gray-50 text-gray-800 border border-gray-200"}`}>
                      <p className="font-semibold text-xs uppercase tracking-wider mb-0.5">
                        {isRejected ? "Alasan Penolakan Admin:" : "Catatan Admin:"}
                      </p>
                      <p>{rec.admin_notes}</p>
                    </div>
                  ) : null}

                  {(isApproved || isCompleted) && rec.return_number ? (
                    <div className="pt-1">
                      <Link
                        href={`/returns/${rec.id}/receipt`}
                        className="text-xs font-semibold text-brand-600 hover:underline"
                        target="_blank"
                      >
                        Lihat / Cetak Nota Retur ({rec.return_number}) →
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    ) : null}
  </Container>;
}
