import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { getCashDrawerSessionDetail } from "@/modules/cash-drawer/data/cash-drawer-history-queries";
import { formatSessionDateTime, formatSessionPercent } from "@/modules/cash-drawer/session-format";
import { paymentLabel, TransactionStatusBadge } from "@/modules/sales/components/transaction-presentation";
import { requireUuid } from "@/modules/shared/validation/input";
import { formatRupiah, formatSignedRupiah } from "@/modules/ui/currency";
import { Card, CardContent, Container } from "@/modules/ui/components";

export const dynamic = "force-dynamic";

export default async function CashDrawerSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  try {
    await requireRole(["owner_admin"]);
  } catch (error) {
    if (isAuthApplicationError(error)) redirect("/");
    throw error;
  }

  const { sessionId } = await params;
  let validSessionId: string;
  try {
    validSessionId = requireUuid(sessionId, "session_id");
  } catch {
    notFound();
  }
  const session = await getCashDrawerSessionDetail(validSessionId);
  if (!session) notFound();

  const statusLabel = (status: "pending_payment" | "completed" | "voided") =>
    status === "completed" ? "Selesai" : status === "pending_payment" ? "Menunggu pembayaran" : "Dibatalkan";

  return (
    <Container size="xl" className="space-y-7">
      <header className="space-y-3">
        <Link href="/cash-drawer/sessions" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-600 hover:underline">
          ← Kembali ke Riwayat Sesi
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">Detail Sesi Kasir</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">{session.cashierName}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {formatSessionDateTime(session.openedAt)} — {session.closedAt ? formatSessionDateTime(session.closedAt) : "masih berjalan"}
            </p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${session.isOpen ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-gray-100 text-gray-700"}`}>
            {session.isOpen ? "Sesi aktif" : "Sesi ditutup"}
          </span>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Saldo Awal</p><p className="mt-2 text-xl font-semibold tabular">{formatRupiah(session.openingBalance)}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Saldo Akhir</p><p className="mt-2 text-xl font-semibold tabular">{session.closingBalanceActual === null ? "Belum ditutup" : formatRupiah(session.closingBalanceActual)}</p>{session.closingBalanceExpected !== null ? <p className="mt-1 text-xs text-[var(--text-muted)]">Perkiraan kas: {formatRupiah(session.closingBalanceExpected)}</p> : null}</CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Selisih Kas</p><p className={`mt-2 text-xl font-semibold tabular ${(session.variance ?? 0) < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{session.variance === null ? "—" : formatSignedRupiah(session.variance)}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Margin</p><p className={`mt-2 text-xl font-semibold tabular ${session.metrics.grossProfit < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{formatSignedRupiah(session.metrics.grossProfit)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{formatSessionPercent(session.metrics.marginPercent)} dari penjualan bersih</p></CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Penjualan</p><p className="mt-2 text-xl font-semibold tabular">{formatRupiah(session.metrics.salesTotal)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{session.metrics.transactionCount} transaksi selesai</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Retur</p><p className="mt-2 text-xl font-semibold tabular">{formatRupiah(session.metrics.refunds)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Retur tunai: {formatRupiah(session.metrics.cashRefunds)}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Pembayaran Tunai</p><p className="mt-2 text-xl font-semibold tabular">{formatRupiah(session.metrics.cashSales)}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-[var(--text-muted)]">Pembayaran QRIS</p><p className="mt-2 text-xl font-semibold tabular">{formatRupiah(session.metrics.qrisSales)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Alur Barang</h2>
            <p className="text-sm text-gray-600">Barang keluar dari penjualan dan barang masuk dari retur selama sesi ini.</p>
          </div>
          {session.flow.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Belum ada pergerakan barang pada sesi ini.</p> : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Waktu</th><th className="py-3 pr-4">Jenis</th><th className="py-3 pr-4">Barang</th><th className="py-3 pr-4">Jumlah</th><th className="py-3 pr-4">Referensi</th><th className="py-3">Nilai</th></tr></thead>
                  <tbody>
                    {session.flow.map((entry) => <tr key={entry.key} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 pr-4">{formatSessionDateTime(entry.occurredAt)}</td>
                      <td className="py-3 pr-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.kind === "out" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{entry.kind === "out" ? "Keluar" : "Masuk"}</span></td>
                      <td className="py-3 pr-4"><span className="font-medium">{entry.productName}</span></td>
                      <td className="py-3 pr-4">{entry.quantity.toLocaleString("id-ID")} {entry.unit}</td>
                      <td className="py-3 pr-4"><span>{entry.reference}</span>{entry.transactionStatus ? <span className="mt-1 block text-xs text-[var(--text-muted)]">{statusLabel(entry.transactionStatus)}</span> : null}</td>
                      <td className="py-3 tabular">{formatRupiah(entry.amount)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:hidden">
                {session.flow.map((entry) => <div key={entry.key} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm">
                  <div className="flex items-start justify-between gap-3"><strong>{entry.productName}</strong><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.kind === "out" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{entry.kind === "out" ? "Keluar" : "Masuk"}</span></div>
                  <p className="mt-2">{entry.quantity.toLocaleString("id-ID")} {entry.unit} · {formatRupiah(entry.amount)}</p>
                  <p className="mt-1 text-[var(--text-muted)]">{entry.reference} · {formatSessionDateTime(entry.occurredAt)}</p>
                  {entry.transactionStatus ? <p className="mt-1 text-xs text-[var(--text-muted)]">{statusLabel(entry.transactionStatus)}</p> : null}
                </div>)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pembayaran</h2>
            <p className="text-sm text-gray-600">Transaksi yang tercatat pada sesi ini.</p>
          </div>
          {session.payments.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Belum ada pembayaran pada sesi ini.</p> : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Waktu</th><th className="py-3 pr-4">Faktur</th><th className="py-3 pr-4">Metode</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Total</th><th className="py-3 pr-4">Diterima</th><th className="py-3">Kembalian</th></tr></thead>
                  <tbody>
                    {session.payments.map((payment) => <tr key={payment.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-3 pr-4">{formatSessionDateTime(payment.createdAt)}</td>
                      <td className="py-3 pr-4"><Link href={`/transactions/${payment.id}`} className="font-medium text-brand-600 hover:underline">{payment.invoiceNumber}</Link></td>
                      <td className="py-3 pr-4">{paymentLabel(payment.method)}</td>
                      <td className="py-3 pr-4"><TransactionStatusBadge status={payment.status} /></td>
                      <td className="py-3 pr-4 font-medium tabular">{formatRupiah(payment.totalAmount)}</td>
                      <td className="py-3 pr-4 tabular">{payment.cashReceived === null ? "—" : formatRupiah(payment.cashReceived)}</td>
                      <td className="py-3 tabular">{payment.cashChange === null ? "—" : formatRupiah(payment.cashChange)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:hidden">
                {session.payments.map((payment) => <div key={payment.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2"><Link href={`/transactions/${payment.id}`} className="font-semibold text-brand-600 hover:underline">{payment.invoiceNumber}</Link><TransactionStatusBadge status={payment.status} /></div>
                  <p className="mt-2 font-medium tabular">{formatRupiah(payment.totalAmount)} · {paymentLabel(payment.method)}</p>
                  <p className="mt-1 text-[var(--text-muted)]">{formatSessionDateTime(payment.createdAt)}</p>
                  {payment.cashReceived !== null ? <p className="mt-1 text-[var(--text-muted)]">Diterima {formatRupiah(payment.cashReceived)} · Kembalian {formatRupiah(payment.cashChange ?? 0)}</p> : null}
                </div>)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {session.refunds.length ? (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Retur dan Refund</h2>
              <p className="text-sm text-gray-600">Pengembalian barang dan uang yang diproses pada sesi ini.</p>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Waktu</th><th className="py-3 pr-4">Faktur Asal</th><th className="py-3 pr-4">Metode Refund</th><th className="py-3 pr-4">Alasan</th><th className="py-3 pr-4">Diproses Oleh</th><th className="py-3">Total</th></tr></thead>
                <tbody>
                  {session.refunds.map((refund) => <tr key={refund.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4">{formatSessionDateTime(refund.createdAt)}</td>
                    <td className="py-3 pr-4">{refund.invoiceNumber ?? "—"}</td>
                    <td className="py-3 pr-4">{refund.method ? paymentLabel(refund.method) : "—"}</td>
                    <td className="py-3 pr-4">{refund.reason}</td>
                    <td className="py-3 pr-4">{refund.processedBy}</td>
                    <td className="py-3 font-medium tabular">{formatRupiah(refund.total)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {session.refunds.map((refund) => <div key={refund.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm">
                <p className="font-semibold tabular">{formatRupiah(refund.total)} · {refund.method ? paymentLabel(refund.method) : "—"}</p>
                <p className="mt-1">{refund.reason}</p>
                <p className="mt-1 text-[var(--text-muted)]">Faktur {refund.invoiceNumber ?? "—"} · {formatSessionDateTime(refund.createdAt)} · {refund.processedBy}</p>
              </div>)}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
