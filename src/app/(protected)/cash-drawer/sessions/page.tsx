import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { listCashDrawerSessions } from "@/modules/cash-drawer/data/cash-drawer-history-queries";
import { formatSessionDateTime, formatSessionPercent } from "@/modules/cash-drawer/session-format";
import { formatRupiah, formatSignedRupiah } from "@/modules/ui/currency";
import { Card, CardContent, Container } from "@/modules/ui/components";

export const dynamic = "force-dynamic";

export default async function CashDrawerSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requireRole(["owner_admin"]);
  } catch (error) {
    if (isAuthApplicationError(error)) redirect("/");
    throw error;
  }

  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { rows, total, pageSize } = await listCashDrawerSessions(page);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => target > 1 ? `/cash-drawer/sessions?page=${target}` : "/cash-drawer/sessions";

  return (
    <Container size="xl" className="space-y-7">
      <header>
        <p className="text-sm font-medium text-[var(--accent)]">Operasional</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Riwayat Sesi Kasir</h1>
        <p className="mt-2 text-base text-gray-600">Pantau sesi kasir, saldo, transaksi, dan margin setiap sesi.</p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-semibold text-gray-800">Belum ada sesi kasir</h2>
            <p className="mt-2 text-base text-gray-600">Sesi kasir yang dibuka akan muncul di sini.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Daftar sesi kasir</caption>
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th scope="col" className="w-[18%] px-5 py-4 font-medium">Kasir</th>
                  <th scope="col" className="w-[17%] px-4 py-4 font-medium">Mulai</th>
                  <th scope="col" className="w-[17%] px-4 py-4 font-medium">Selesai</th>
                  <th scope="col" className="w-[14%] px-4 py-4 font-medium">Saldo Awal</th>
                  <th scope="col" className="w-[15%] px-4 py-4 font-medium">Saldo Akhir</th>
                  <th scope="col" className="w-[14%] px-4 py-4 font-medium">Margin</th>
                  <th scope="col" className="w-[5%] px-4 py-4"><span className="sr-only">Detail</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top text-gray-800 hover:bg-gray-50/60">
                    <td className="px-5 py-5">
                      <Link href={`/cash-drawer/sessions/${row.id}`} className="font-semibold text-brand-600 hover:underline">{row.cashierName}</Link>
                      <p className={`mt-1 text-xs font-medium ${row.isOpen ? "text-[var(--success)]" : "text-[var(--text-muted)]"}`}>
                        {row.isOpen ? "Sesi aktif" : `${row.metrics.transactionCount} transaksi selesai`}
                      </p>
                    </td>
                    <td className="px-4 py-5">{formatSessionDateTime(row.openedAt)}</td>
                    <td className="px-4 py-5">{row.closedAt ? formatSessionDateTime(row.closedAt) : <span className="font-medium text-[var(--success)]">Masih berjalan</span>}</td>
                    <td className="px-4 py-5 font-medium tabular">{formatRupiah(row.openingBalance)}</td>
                    <td className="px-4 py-5 font-medium tabular">
                      {row.closingBalanceActual === null ? <span className="text-[var(--text-muted)]">Belum ditutup</span> : formatRupiah(row.closingBalanceActual)}
                    </td>
                    <td className="px-4 py-5">
                      <span className={`font-semibold tabular ${row.metrics.grossProfit < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{formatSignedRupiah(row.metrics.grossProfit)}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatSessionPercent(row.metrics.marginPercent)}</span>
                    </td>
                    <td className="px-4 py-5"><Link href={`/cash-drawer/sessions/${row.id}`} aria-label={`Lihat detail sesi ${row.cashierName}`} className="text-sm font-semibold text-brand-600 hover:underline">Detail</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:hidden">
            {rows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/cash-drawer/sessions/${row.id}`} className="text-lg font-semibold text-brand-600 hover:underline">{row.cashierName}</Link>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{row.isOpen ? "Sesi aktif" : `${row.metrics.transactionCount} transaksi selesai`}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.isOpen ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-gray-100 text-gray-700"}`}>{row.isOpen ? "Aktif" : "Ditutup"}</span>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-[var(--text-muted)]">Mulai</dt><dd className="mt-0.5 font-medium">{formatSessionDateTime(row.openedAt)}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Selesai</dt><dd className="mt-0.5 font-medium">{row.closedAt ? formatSessionDateTime(row.closedAt) : "Masih berjalan"}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Saldo Awal</dt><dd className="mt-0.5 font-medium tabular">{formatRupiah(row.openingBalance)}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Saldo Akhir</dt><dd className="mt-0.5 font-medium tabular">{row.closingBalanceActual === null ? "Belum ditutup" : formatRupiah(row.closingBalanceActual)}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">Margin</dt><dd className={`mt-0.5 font-semibold tabular ${row.metrics.grossProfit < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{formatSignedRupiah(row.metrics.grossProfit)} · {formatSessionPercent(row.metrics.marginPercent)}</dd></div>
                  </dl>
                  <Link href={`/cash-drawer/sessions/${row.id}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-gray-50">Lihat Detail Sesi</Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <nav aria-label="Halaman riwayat sesi" className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-gray-700">{total.toLocaleString("id-ID")} sesi · Halaman {page} dari {pages}</p>
            <div className="flex flex-wrap gap-2">
              {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium hover:bg-gray-50">Sebelumnya</Link> : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm text-gray-400">Sebelumnya</span>}
              {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium hover:bg-gray-50">Berikutnya</Link> : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm text-gray-400">Berikutnya</span>}
            </div>
          </nav>
        </>
      )}
    </Container>
  );
}
