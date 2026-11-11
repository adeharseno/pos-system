import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { getReceivableDetailForOwner } from "@/modules/receivables/application/receivables-service";
import { ReceivableStatusBadge } from "@/modules/receivables/components/receivable-status-badge";
import { RecordPaymentModal } from "@/modules/receivables/components/record-payment-modal";
import { receivablePaymentMethodLabel } from "@/modules/receivables/receivables-filters";
import { jakartaToday } from "@/modules/reports/sales-report";
import { TransactionModuleTabs } from "@/modules/sales/components/transaction-module-tabs";
import { transactionLinkClass } from "@/modules/sales/components/transaction-presentation";
import { formatReceiptDate } from "@/modules/sales/receipt";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { requireUuid } from "@/modules/shared/validation/input";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";
import { formatIndonesianDate } from "@/modules/ui/date";

export default async function ReceivableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireRole(["owner_admin"]);
  } catch {
    redirect("/transactions");
  }

  const { id } = await params;
  let receivableId: string;
  try {
    receivableId = requireUuid(id, "receivableId");
  } catch {
    notFound();
  }

  let detail: Awaited<ReturnType<typeof getReceivableDetailForOwner>>;
  try {
    detail = await getReceivableDetailForOwner(receivableId);
  } catch (error) {
    if (error instanceof PosDomainError && error.code === "RECEIVABLE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const today = jakartaToday();

  return (
    <Container size="xl" className="space-y-7">
      <TransactionModuleTabs current="receivables" isOwner={true} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">Detail Piutang</h1>
            <ReceivableStatusBadge
              status={detail.effectiveStatus}
              paidAmount={detail.paidAmount}
            />
          </div>
          <p className="mt-1.5 text-base text-gray-600">
            Invoice <strong className="font-semibold text-gray-900">{detail.invoiceNumber}</strong>{" "}
            &middot; {detail.customer.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {detail.outstandingAmount > 0 ? (
            <RecordPaymentModal
              receivableId={detail.id}
              invoiceNumber={detail.invoiceNumber}
              outstandingAmount={detail.outstandingAmount}
              today={today}
            />
          ) : null}
          <Link href="/transactions/receivables" className={transactionLinkClass}>
            &larr; Kembali ke Piutang
          </Link>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Informasi Pelanggan &amp; Invoice</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-5 text-base sm:grid-cols-2">
              <div>
                <dt className="text-sm text-gray-500">Nomor Invoice</dt>
                <dd className="mt-1 font-semibold text-gray-900">{detail.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Tanggal Transaksi</dt>
                <dd className="mt-1 text-gray-900">{formatReceiptDate(detail.transactionCreatedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Pelanggan</dt>
                <dd className="mt-1 font-semibold text-gray-900">{detail.customer.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Kontak Pelanggan</dt>
                <dd className="mt-1 text-gray-900">{detail.customer.phone ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Alamat Pelanggan</dt>
                <dd className="mt-1 text-gray-900">{detail.customer.address ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Tanggal Jatuh Tempo</dt>
                <dd
                  className={`mt-1 font-semibold ${
                    detail.isOverdue ? "text-red-700" : "text-gray-900"
                  }`}
                >
                  {formatIndonesianDate(detail.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Kasir</dt>
                <dd className="mt-1 text-gray-900">{detail.cashierName}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4">
              <Link href={`/transactions/${detail.transactionId}`} className={transactionLinkClass}>
                Lihat Detail Transaksi
              </Link>
              <Link
                href={`/transactions/${detail.transactionId}/receipt`}
                target="_blank"
                className={transactionLinkClass}
              >
                Cetak / Lihat Invoice
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Ringkasan Tagihan</h2>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-base">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">Total Tagihan Awal</dt>
                <dd className="font-semibold text-gray-900 tabular">
                  {formatRupiah(detail.originalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">Sudah Dibayar (Cicilan / Pelunasan)</dt>
                <dd className="font-semibold text-emerald-700 tabular">
                  {formatRupiah(detail.paidAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-600">Pengurang dari Retur Disetujui</dt>
                <dd className="font-semibold text-blue-700 tabular">
                  {formatRupiah(detail.creditedReturnAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-4 text-xl font-bold">
                <dt className="text-gray-900">Sisa Piutang</dt>
                <dd
                  className={`tabular ${
                    detail.outstandingAmount > 0 ? "text-amber-800" : "text-emerald-700"
                  }`}
                >
                  {formatRupiah(detail.outstandingAmount)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Daftar Barang yang Dibeli</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <caption className="sr-only">Daftar barang dalam transaksi piutang</caption>
            <thead className="border-b border-gray-200 bg-gray-50 text-sm text-gray-700">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">
                  Nama Barang
                </th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold">
                  Jumlah
                </th>
                <th scope="col" className="px-5 py-3.5 text-right font-semibold">
                  Harga Satuan
                </th>
                <th scope="col" className="px-5 py-3.5 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3.5 font-medium text-gray-900">{item.productName}</td>
                  <td className="px-5 py-3.5 text-center text-gray-700 tabular">
                    {item.quantityInUnit} {item.unitName}
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-700 tabular">
                    {formatRupiah(item.unitPrice)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-gray-900 tabular">
                    {formatRupiah(item.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Riwayat Pembayaran</h2>
        </CardHeader>
        {detail.payments.length === 0 ? (
          <CardContent>
            <p className="text-base text-gray-600">Belum ada pembayaran piutang yang tercatat.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <caption className="sr-only">Riwayat pembayaran cicilan dan pelunasan piutang</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-sm text-gray-700">
                <tr>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Tanggal Pembayaran
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Metode
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">
                    Nominal
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Referensi / Catatan
                  </th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    Dicatat Oleh
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {detail.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="whitespace-nowrap px-5 py-3.5 text-gray-900">
                      {formatIndonesianDate(payment.paymentDate)}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {receivablePaymentMethodLabel(payment.paymentMethod)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-700 tabular">
                      {formatRupiah(payment.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700">
                      <p>{payment.reference || "-"}</p>
                      {payment.notes ? <p className="mt-0.5 text-gray-500">{payment.notes}</p> : null}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700">
                      <p className="font-medium text-gray-900">{payment.recordedByName}</p>
                      <p className="text-xs text-gray-500">{formatReceiptDate(payment.createdAt)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail.returns.length > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Riwayat Retur Terkait</h2>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <ul className="divide-y divide-gray-200">
              {detail.returns.map((ret) => (
                <li
                  key={ret.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {ret.returnNumber || "Menunggu Persetujuan Admin"}{" "}
                      <span className="ml-2 text-xs font-medium uppercase text-gray-500">
                        ({ret.status})
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-gray-600">{ret.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Pengurang Piutang: {formatRupiah(ret.receivableCreditAmount)} &middot; Excess Refund:{" "}
                      {formatRupiah(ret.cashRefundAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900 tabular">
                      {formatRupiah(ret.refundTotal)}
                    </span>
                    <Link href={`/returns/${ret.id}`} className={transactionLinkClass}>
                      Detail Retur
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}

