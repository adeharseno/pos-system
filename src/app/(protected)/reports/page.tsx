import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { jakartaToday, reportPeriod, validateReportPeriod } from "@/modules/reports/sales-report";
import { getSalesGrossProfitReport } from "@/modules/reports/sales-report-service";
import { getProductPerformanceReport } from "@/modules/reports/product-performance-service";
import { getPaymentRefundReport } from "@/modules/reports/payment-refund-service";
import { getProfitLossReport } from "@/modules/reports/profit-loss-service";
import { Button, Card, CardContent, Container, FormField, Input, Label } from "@/modules/ui/components";

type SearchParams = { period?: string; from?: string; to?: string; tab?: string; sort?: string; page?: string };
type Period = "today" | "week" | "month" | "custom";

// Monetary values from the reporting RPC are decimal strings; use integer cents
// so negative amounts and fractional rupiah remain accurate on the server.
function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Invalid report amount");
  const amount = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return match[1] ? -amount : amount;
}

function rupiah(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const fraction = absolute % BigInt(100);
  return `${negative ? "-" : ""}Rp ${(absolute / BigInt(100)).toLocaleString("id-ID")}${fraction ? `,${String(fraction).padStart(2, "0")}` : ""}`;
}

function getPeriod(preset: Period, from?: string, to?: string) {
  if (preset === "custom") return validateReportPeriod({ from: from ?? jakartaToday(), to: to ?? jakartaToday() });
  const period = reportPeriod(preset);
  if (preset === "week") {
    const sunday = new Date(`${period.from}T00:00:00Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return { from: period.from, to: sunday.toISOString().slice(0, 10) };
  }
  if (preset === "month") {
    const [year, month] = period.from.split("-").map(Number);
    return { from: period.from, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  }
  return period;
}

const filters: { value: Period; label: string }[] = [
  { value: "today", label: "Hari Ini" },
  { value: "week", label: "Minggu Ini" },
  { value: "month", label: "Bulan Ini" },
  { value: "custom", label: "Rentang Tanggal" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  try {
    await requireRole(["owner_admin"]);
  } catch {
    redirect("/");
  }

  const params = await searchParams;
  const preset = filters.find((filter) => filter.value === params.period)?.value ?? "today";
  const tab = params.tab === "products" ? "products" : params.tab === "payments" ? "payments" : params.tab === "profit" ? "profit" : "sales";
  const sort = params.sort === "revenue" ? "revenue" : "quantity";
  function reportLink(overrides: Record<string, string | undefined>) {
    const values: Record<string, string | undefined> = {
      tab, period: preset, from: params.from, to: params.to, sort, ...overrides,
    };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, value);
    return `/reports?${query.toString()}`;
  }
  let report: Awaited<ReturnType<typeof getSalesGrossProfitReport>> | undefined;
  let performance: Awaited<ReturnType<typeof getProductPerformanceReport>> | undefined;
  let payments: Awaited<ReturnType<typeof getPaymentRefundReport>> | undefined;
  let profit: Awaited<ReturnType<typeof getProfitLossReport>> | undefined;
  let error: string | undefined;
  try {
    const period = getPeriod(preset, params.from, params.to);
    if (tab === "products") performance = await getProductPerformanceReport(period, sort);
    else if (tab === "payments") payments = await getPaymentRefundReport(period);
    else if (tab === "profit") profit = await getProfitLossReport(period);
    else report = await getSalesGrossProfitReport(period);
  } catch (cause) {
    error = cause instanceof Error && cause.message === "INVALID_REPORT_PERIOD"
      ? "Rentang tanggal tidak valid. Periksa tanggal awal dan tanggal akhir."
      : "Laporan tidak dapat dimuat. Silakan coba lagi.";
  }

  const metrics = report ? [
    { label: "Total Penjualan (sebelum pajak)", value: rupiah(cents(report.salesRevenue)) },
    { label: "Jumlah Transaksi", value: report.completedTransactionCount.toLocaleString("id-ID") },
    { label: "Total Retur (sebelum pajak)", value: rupiah(cents(report.refunds)) },
    { label: "Penjualan Bersih", value: rupiah(cents(report.netRevenue)) },
    { label: "HPP Bersih", value: rupiah(cents(report.cogs) - cents(report.returnedCogs)) },
    { label: "Laba Kotor", value: rupiah(cents(report.grossProfit)) },
    { label: "Margin Laba Kotor", value: report.grossMarginPercent === null ? "—" : `${report.grossMarginPercent.replace(".", ",")}%` },
    { label: "Pajak Bersih", value: rupiah(cents(report.salesTax) - cents(report.refundedTax)) },
  ] : [];
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil((performance?.unsold.length ?? 0) / pageSize));
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const unsold = performance?.unsold.slice((page - 1) * pageSize, page * pageSize) ?? [];
  const quantity = (value: string) => BigInt(value).toLocaleString("id-ID");
  const sumPayments = (field: "paymentsReceived" | "pendingAmount" | "customerRefunds" | "netPayments") =>
    payments?.methods.reduce((sum, method) => sum + cents(method[field]), BigInt(0)) ?? BigInt(0);
  const paymentMetrics = payments ? [
    { label: "Total Pembayaran Lunas", value: rupiah(sumPayments("paymentsReceived")) },
    { label: "Total Menunggu Pembayaran", value: rupiah(sumPayments("pendingAmount")) },
    { label: "Total Refund", value: rupiah(sumPayments("customerRefunds")) },
    { label: "Total Pembayaran Bersih", value: rupiah(sumPayments("netPayments")) },
  ] : [];
  const paymentName = (method: string) => method === "cash" ? "Tunai" : method === "qris" ? "QRIS" : "Transfer Bank";
  const profitMetrics = profit ? [
    { label: "Penjualan Sebelum Pajak", value: rupiah(cents(profit.salesRevenue)) },
    { label: "Retur Penjualan", value: rupiah(cents(profit.refunds)) },
    { label: "Penjualan Bersih", value: rupiah(cents(profit.netRevenue)) },
    { label: "HPP Bersih", value: rupiah(cents(profit.netCogs)) },
    { label: "Laba Kotor", value: rupiah(cents(profit.grossProfit)) },
    { label: "Margin Laba Kotor", value: profit.grossMarginPercent === null ? "—" : `${profit.grossMarginPercent.replace(".", ",")}%` },
    { label: "Total Biaya Operasional", value: rupiah(cents(profit.operatingExpenses)) },
  ] : [];
  const estimatedProfit = profit ? cents(profit.estimatedProfitAfterRecordedExpenses) : BigInt(0);

  return (
    <Container size="xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Laporan Penjualan</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Lihat ringkasan penjualan dan laba kotor apotek.</p>
        <Link href="/expenses" className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Biaya Operasional</Link>
      </header>
      <nav aria-label="Jenis laporan" className="mb-4 flex flex-wrap gap-2">
        {[{ value: "sales", label: "Penjualan" }, { value: "products", label: "Performa Produk" }, { value: "payments", label: "Pembayaran & Retur" }, { value: "profit", label: "Laba & Rugi" }].map((item) => (
          <Link key={item.value} href={reportLink({ tab: item.value, page: undefined })} aria-current={tab === item.value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-[var(--radius)] border px-4 py-2 text-sm font-medium ${tab === item.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-subtle)]"}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="Pilih periode laporan" className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Link key={filter.value} href={reportLink({ period: filter.value, page: undefined })} aria-current={preset === filter.value ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-[var(--radius)] border px-4 py-2 text-sm font-medium ${preset === filter.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-subtle)]"}`}>
                {filter.label}
              </Link>
            ))}
          </nav>
          {preset === "custom" ? (
            <form className="flex flex-wrap items-end gap-3" action="/reports">
              <input type="hidden" name="period" value="custom" />
              <input type="hidden" name="tab" value={tab} />
              {tab === "products" ? <input type="hidden" name="sort" value={sort} /> : null}
              <FormField><Label htmlFor="report-from">Tanggal awal</Label><Input id="report-from" name="from" type="date" required defaultValue={params.from ?? jakartaToday()} /></FormField>
              <FormField><Label htmlFor="report-to">Tanggal akhir</Label><Input id="report-to" name="to" type="date" required defaultValue={params.to ?? jakartaToday()} /></FormField>
              <Button type="submit">Tampilkan Laporan</Button>
            </form>
          ) : null}
          <p className="text-sm text-[var(--text-muted)]">Tanggal laporan menggunakan waktu Asia/Jakarta.</p>
        </CardContent>
      </Card>
      {error ? <p role="alert" className="mt-5 text-sm text-[var(--danger)]">{error}</p> : null}
      {report ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--text-muted)]">Periode: {report.period.from} sampai {report.period.to}</p>
          {report.completedTransactionCount === 0 ? <p className="text-sm text-[var(--text-muted)]">Tidak ada transaksi penjualan selesai pada periode ini. Retur, jika ada, tetap diperhitungkan.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <Card key={metric.label}><CardContent><h2 className="text-sm text-[var(--text-muted)]">{metric.label}</h2><p className="mt-2 break-words text-xl font-semibold">{metric.value}</p></CardContent></Card>)}
          </div>
          <p className="text-sm text-[var(--text-muted)]">HPP bersih adalah harga pokok barang terjual setelah memperhitungkan retur. Laba kotor belum dikurangi biaya operasional.</p>
          {report.limitations.map((limitation) => <p key={limitation} className="text-sm text-[var(--text-muted)]">{limitation}</p>)}
        </div>
      ) : null}
      {performance ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-[var(--text-muted)]">Periode: {performance.period.from} sampai {performance.period.to}</p>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold">Produk Terlaris</h2><p className="text-sm text-[var(--text-muted)]">Maksimal 10 barang, setelah memperhitungkan retur pada periode ini.</p></div>
                <nav aria-label="Urutkan produk terlaris" className="flex flex-wrap gap-2">
                  {([{ value: "quantity", label: "Jumlah" }, { value: "revenue", label: "Penjualan" }] as const).map((option) => (
                    <Link key={option.value} href={reportLink({ sort: option.value })} aria-current={sort === option.value ? "page" : undefined}
                      className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${sort === option.value ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)]"}`}>{option.label}</Link>
                  ))}
                </nav>
              </div>
              {performance.bestSelling.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Belum ada penjualan atau retur barang pada periode ini.</p> : (
                <>
                  <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Barang / SKU</th><th className="py-3 pr-4">Jumlah bersih (unit dasar)</th><th className="py-3">Penjualan bersih</th></tr></thead><tbody>
                    {performance.bestSelling.slice(0, 10).map((item) => <tr key={item.productId} className="border-b border-[var(--border)] last:border-0"><td className="py-3 pr-4"><span className="font-medium">{item.name}</span><span className="block text-[var(--text-muted)]">{item.sku}</span></td><td className="py-3 pr-4">{quantity(item.netQuantity)}</td><td className="py-3">{rupiah(cents(item.netRevenue))}</td></tr>)}
                  </tbody></table></div>
                  <div className="grid gap-3 md:hidden">{performance.bestSelling.slice(0, 10).map((item) => <div key={item.productId} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm"><p className="font-semibold">{item.name}</p><p className="text-[var(--text-muted)]">{item.sku}</p><p className="mt-2">Jumlah bersih: {quantity(item.netQuantity)} unit dasar</p><p>Penjualan bersih: {rupiah(cents(item.netRevenue))}</p></div>)}</div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <div><h2 className="text-lg font-semibold">Produk Tidak Laku</h2><p className="text-sm text-[var(--text-muted)]">Barang aktif tanpa penjualan selesai pada periode ini. Stok ditampilkan sesuai kondisi saat ini.</p></div>
              {unsold.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Tidak ada barang tanpa penjualan pada periode ini.</p> : (
                <>
                  <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Barang / SKU</th><th className="py-3 pr-4">Stok tersedia</th><th className="py-3">Kondisi stok</th></tr></thead><tbody>
                    {unsold.map((item) => <tr key={item.productId} className="border-b border-[var(--border)] last:border-0"><td className="py-3 pr-4"><span className="font-medium">{item.name}</span><span className="block text-[var(--text-muted)]">{item.sku}</span></td><td className="py-3 pr-4">{quantity(item.availableStock)} {item.baseUnit}</td><td className="py-3">{item.hasStock ? "Stok tersedia" : "Stok habis"}</td></tr>)}
                  </tbody></table></div>
                  <div className="grid gap-3 md:hidden">{unsold.map((item) => <div key={item.productId} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm"><p className="font-semibold">{item.name}</p><p className="text-[var(--text-muted)]">{item.sku}</p><p className="mt-2">Stok: {quantity(item.availableStock)} {item.baseUnit}</p><p>{item.hasStock ? "Stok tersedia" : "Stok habis"}</p></div>)}</div>
                </>
              )}
              {totalPages > 1 ? <nav aria-label="Halaman produk tidak laku" className="flex flex-wrap items-center gap-3 text-sm">
                {page > 1 ? <Link className="rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-2" href={reportLink({ page: String(page - 1) })}>Sebelumnya</Link> : null}
                <span>Halaman {page} dari {totalPages}</span>
                {page < totalPages ? <Link className="rounded-[var(--radius)] border border-[var(--border-strong)] px-3 py-2" href={reportLink({ page: String(page + 1) })}>Selanjutnya</Link> : null}
              </nav> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {payments ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-[var(--text-muted)]">Periode: {payments.period.from} sampai {payments.period.to}</p>
          {payments.methods.every((method) => method.completedCount === 0 && method.pendingCount === 0 && cents(method.customerRefunds) === BigInt(0)) ? (
            <p className="text-sm text-[var(--text-muted)]">Tidak ada pembayaran lunas, pembayaran menunggu, atau refund pada periode ini.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {paymentMetrics.map((metric) => <Card key={metric.label}><CardContent><h2 className="text-sm text-[var(--text-muted)]">{metric.label}</h2><p className="mt-2 break-words text-xl font-semibold">{metric.value}</p></CardContent></Card>)}
          </div>
          <Card>
            <CardContent className="space-y-4">
              <div><h2 className="text-lg font-semibold">Rincian Pembayaran dan Refund</h2><p className="text-sm text-[var(--text-muted)]">Refund dikelompokkan menurut metode pengembalian yang digunakan, yang dapat berbeda dari metode pembayaran awal.</p></div>
              <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Metode Pembayaran</th><th className="py-3 pr-4">Jumlah Transaksi Lunas</th><th className="py-3 pr-4">Total Pembayaran</th><th className="py-3 pr-4">Total Refund</th><th className="py-3">Pembayaran Bersih</th></tr></thead><tbody>
                {payments.methods.map((method) => <tr key={method.method} className="border-b border-[var(--border)] last:border-0"><td className="py-3 pr-4 font-medium">{paymentName(method.method)}</td><td className="py-3 pr-4">{method.completedCount.toLocaleString("id-ID")}</td><td className="py-3 pr-4">{rupiah(cents(method.paymentsReceived))}</td><td className="py-3 pr-4">{rupiah(cents(method.customerRefunds))}</td><td className="py-3">{rupiah(cents(method.netPayments))}</td></tr>)}
              </tbody></table></div>
              <div className="grid gap-3 md:hidden">{payments.methods.map((method) => <div key={method.method} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm"><p className="font-semibold">{paymentName(method.method)}</p><p className="mt-2">Transaksi lunas: {method.completedCount.toLocaleString("id-ID")}</p><p>Total pembayaran: {rupiah(cents(method.paymentsReceived))}</p><p>Total refund: {rupiah(cents(method.customerRefunds))}</p><p>Pembayaran bersih: {rupiah(cents(method.netPayments))}</p></div>)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <div><h2 className="text-lg font-semibold">Menunggu Pembayaran</h2><p className="text-sm text-[var(--text-muted)]">{payments.pendingBasis} Pembayaran yang menunggu tidak termasuk pembayaran lunas.</p></div>
              {payments.methods.every((method) => method.pendingCount === 0) ? <p className="text-sm text-[var(--text-muted)]">Tidak ada pembayaran yang masih menunggu pada periode ini.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{payments.methods.filter((method) => method.pendingCount > 0).map((method) => <div key={method.method} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm"><p className="font-semibold">{paymentName(method.method)}</p><p className="mt-2">Jumlah transaksi: {method.pendingCount.toLocaleString("id-ID")}</p><p>Jumlah menunggu: {rupiah(cents(method.pendingAmount))}</p></div>)}</div>
              )}
            </CardContent>
          </Card>
          {payments.limitations.map((limitation) => <p key={limitation} className="text-sm text-[var(--text-muted)]">{limitation}</p>)}
        </div>
      ) : null}
      {profit ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-[var(--text-muted)]">Periode: {profit.period.from} sampai {profit.period.to}</p>
          {cents(profit.salesRevenue) === BigInt(0) && cents(profit.refunds) === BigInt(0) && cents(profit.operatingExpenses) === BigInt(0) ? (
            <p className="text-sm text-[var(--text-muted)]">Tidak ada nilai penjualan, retur, atau biaya tercatat pada periode ini.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {profitMetrics.map((metric) => <Card key={metric.label}><CardContent><h2 className="text-sm text-[var(--text-muted)]">{metric.label}</h2><p className="mt-2 break-words text-xl font-semibold">{metric.value}</p></CardContent></Card>)}
          </div>
          <Card className={estimatedProfit < BigInt(0) ? "border-[var(--danger)]" : undefined}>
            <CardContent className="space-y-3">
              <h2 className="text-lg font-semibold">Estimasi Laba Setelah Biaya Tercatat</h2>
              <p className="text-sm text-[var(--text-muted)]">Estimasi Laba = Laba Kotor - Biaya Operasional</p>
              <p className="text-sm">{rupiah(cents(profit.grossProfit))} - {rupiah(cents(profit.operatingExpenses))}</p>
              <p className={`break-words text-xl font-semibold ${estimatedProfit < BigInt(0) ? "text-[var(--danger)]" : ""}`}>
                {estimatedProfit < BigInt(0) ? "Kerugian" : estimatedProfit > BigInt(0) ? "Keuntungan" : "Impas"}: {rupiah(estimatedProfit < BigInt(0) ? -estimatedProfit : estimatedProfit)}
              </p>
              <p className="text-sm text-[var(--text-muted)]">Estimasi laba berdasarkan penjualan dan biaya yang tercatat. Belum merupakan laba bersih final secara akuntansi.</p>
              <Link href="/expenses" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Kelola Biaya Operasional</Link>
            </CardContent>
          </Card>
          {profit.limitations.slice(1).map((limitation) => <p key={limitation} className="text-sm text-[var(--text-muted)]">{limitation}</p>)}
        </div>
      ) : null}
    </Container>
  );
}
