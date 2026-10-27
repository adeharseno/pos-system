import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getCustomerReturns, getTransaction } from "@/modules/sales/data/transaction-queries";
import { buildReceiptViewModel, formatReceiptDate, type ReceiptTransactionRow } from "@/modules/sales/receipt";
import { TransactionActions } from "@/modules/sales/components/transaction-actions";
import { paymentLabel, TransactionStatusBadge, transactionLinkClass } from "@/modules/sales/components/transaction-presentation";
import { transactionActionVisibility } from "@/modules/sales/transaction-detail-ui";
import { requireUuid } from "@/modules/shared/validation/input";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";
import { returnQuantity } from "@/modules/returns/return-quantity";
import { canStartReturn, detailReturnState } from "@/modules/returns/return-detail-state";

type ReturnItem = { transaction_item_id: string; quantity_in_base: number };
type ReturnRecord = { return_items: ReturnItem[] | null };
type DetailItem = { id: string; quantity_in_base: number; conversion_to_base_snapshot: number };

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePosOperator();
  const { id } = await params;
  let transactionId: string;
  try { transactionId = requireUuid(id, "transactionId"); } catch { notFound(); }
  const row = await getTransaction(transactionId);
  if (!row) notFound();
  const transaction = buildReceiptViewModel(row as unknown as ReceiptTransactionRow);
  const records = await getCustomerReturns(transactionId) as ReturnRecord[];
  const returned = new Map<string, number>();
  for (const record of records) for (const item of record.return_items ?? []) returned.set(item.transaction_item_id, (returned.get(item.transaction_item_id) ?? 0) + item.quantity_in_base);
  const quantities = (row.transaction_items as DetailItem[]).map(item => ({ id: item.id, source: item, ...returnQuantity({ purchasedBase: item.quantity_in_base, returnedBase: returned.get(item.id) ?? 0, conversionToBase: item.conversion_to_base_snapshot }) }));
  const state = detailReturnState(quantities.map(item => ({ purchasedBase: item.source.quantity_in_base, returnedBase: returned.get(item.id) ?? 0, conversionToBase: item.source.conversion_to_base_snapshot, remainingBase: item.remainingBase })));
  const actions = transactionActionVisibility(transaction.status, row.payment_method, records.length > 0);

  return <Container size="xl" className="space-y-7">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-gray-900">Detail Transaksi</h1><Link href="/transactions" className={transactionLinkClass}>Kembali ke Transaksi</Link></header>
    <Card><CardHeader><h2 className="text-lg font-semibold text-gray-900">Informasi Transaksi</h2></CardHeader><CardContent>
      <dl className="grid gap-6 text-base sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-gray-600">Nomor transaksi</dt><dd className="mt-2 break-all font-semibold text-gray-900">{transaction.invoiceNumber}</dd></div>
        <div><dt className="text-gray-600">Tanggal dan waktu</dt><dd className="mt-2 text-gray-900">{formatReceiptDate(transaction.createdAt)}</dd></div>
        <div><dt className="text-gray-600">Kasir</dt><dd className="mt-2 break-words text-gray-900">{transaction.cashierName}</dd></div>
        <div><dt className="text-gray-600">Status</dt><dd className="mt-2"><TransactionStatusBadge status={transaction.status} /></dd></div>
      </dl>
      {state === "partial" ? <p className="mt-6 border-t border-gray-200 pt-5 text-base font-medium text-gray-700">Sebagian barang sudah diretur.</p> : state === "full" ? <p className="mt-6 border-t border-gray-200 pt-5 text-base font-medium text-gray-700">Semua barang sudah diretur.</p> : null}
    </CardContent></Card>
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
          </li>;
        })}</ul>
      </Card>
      <Card className="min-w-0"><CardHeader><h2 className="text-lg font-semibold text-gray-900">Pembayaran</h2></CardHeader><CardContent className="space-y-6">
        <dl className="space-y-4 text-base">
          <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Metode pembayaran</dt><dd className="font-medium text-gray-900">{paymentLabel(row.payment_method)}</dd></div>
          <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Subtotal</dt><dd className="font-medium tabular">{formatRupiah(transaction.subtotal)}</dd></div>
          {transaction.taxAmount > 0 ? <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Pajak</dt><dd className="font-medium tabular">{formatRupiah(transaction.taxAmount)}</dd></div> : null}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5 text-xl font-semibold"><dt>Total pembayaran</dt><dd className="break-words tabular">{formatRupiah(transaction.total)}</dd></div>
          {transaction.paymentMethod === "cash" ? <>
            <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Uang diterima</dt><dd className="tabular">{formatRupiah(transaction.cashReceived ?? 0)}</dd></div>
            <div className="flex flex-wrap justify-between gap-3"><dt className="text-gray-600">Kembalian</dt><dd className="tabular">{formatRupiah(transaction.cashChange ?? 0)}</dd></div>
          </> : <div><dt className="text-gray-600">Pembayaran</dt><dd className="mt-2 font-medium">{transaction.status === "completed" ? "Sudah dikonfirmasi" : transaction.status === "voided" ? "Transaksi dibatalkan" : "Menunggu konfirmasi"}</dd></div>}
        </dl>
        <div className="grid gap-3 border-t border-gray-200 pt-6">
          <Link href={`/transactions/${transaction.transactionId}/receipt`} className={`${transactionLinkClass} w-full`}>Lihat / Cetak Struk</Link>
          {canStartReturn(transaction.status, state) ? <Link href={`/transactions/${transaction.transactionId}/return`} className={`${transactionLinkClass} w-full`}>Retur Barang</Link> : null}
          <TransactionActions transactionId={transaction.transactionId} invoice={transaction.invoiceNumber} total={transaction.total} status={transaction.status} canConfirm={actions.confirm} canVoid={actions.void} />
        </div>
      </CardContent></Card>
    </div>
  </Container>;
}
