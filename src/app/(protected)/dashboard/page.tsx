import Link from "next/link";
import { Suspense } from "react";
import { getDashboardAnalytics, getDashboardContext, getDashboardLowStock } from "@/modules/dashboard/dashboard-service";
import { dashboardFilters, dateLabel, presets, type DashboardFilters, type DashboardQuery } from "@/modules/dashboard/dashboard-model";
import { MonthlySalesChart } from "@/modules/dashboard/dashboard-charts";
import { DashboardSkeleton } from "@/modules/dashboard/dashboard-skeleton";
import { jakartaToday } from "@/modules/reports/sales-report";
import { Button, Card, CardContent, Container, FormField, Input, Label, Select } from "@/modules/ui/components";
import { StockStatus } from "@/modules/catalog/components/product-presentation";

const linkClass = "inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-800 transition hover:bg-gray-50";

function PeriodControls({ query, filters }: { query: DashboardQuery; filters?: DashboardFilters }) {
  const preset = filters?.preset ?? (query.period === "custom" ? "custom" : "today");
  return <div className="space-y-5">
    <nav aria-label="Periode ringkasan" className="flex flex-wrap gap-3">
      {presets.map(item => {
        const values = new URLSearchParams({ period: item.value });
        if (query.year) values.set("year", query.year);
        if (item.value === "custom") {
          values.set("from", filters?.period.from ?? jakartaToday());
          values.set("to", filters?.period.to ?? jakartaToday());
        }
        return <Link key={item.value} href={`/dashboard?${values}`} aria-current={preset === item.value ? "page" : undefined}
          className={`${linkClass} ${preset === item.value ? "border-brand-500! bg-brand-50! text-brand-600!" : ""}`}>
          {item.label}
        </Link>;
      })}
    </nav>
    {preset === "custom" ? <form key={`${query.from}-${query.to}`} action="/dashboard" className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="period" value="custom" />
      {query.year ? <input type="hidden" name="year" value={query.year} /> : null}
      <FormField className="min-w-0 grow sm:grow-0"><Label htmlFor="dashboard-from">Tanggal awal</Label><Input id="dashboard-from" name="from" type="date" required defaultValue={query.from ?? filters?.period.from ?? jakartaToday()} /></FormField>
      <FormField className="min-w-0 grow sm:grow-0"><Label htmlFor="dashboard-to">Tanggal akhir</Label><Input id="dashboard-to" name="to" type="date" required defaultValue={query.to ?? filters?.period.to ?? jakartaToday()} /></FormField>
      <Button type="submit">Tampilkan</Button>
    </form> : null}
  </div>;
}

async function Analytics({ filters }: { filters: DashboardFilters }) {
  let data: Awaited<ReturnType<typeof getDashboardAnalytics>>;
  try { data = await getDashboardAnalytics(filters); }
  catch {
    return <Card><CardContent><p role="alert">Data belum dapat dimuat.</p><Link href="/dashboard" className={`${linkClass} mt-5`}>Coba Lagi</Link></CardContent></Card>;
  }
  const currentYear = Number(jakartaToday().slice(0, 4));
  const years = [...new Set([...Array.from({ length: 7 }, (_, index) => currentYear - 5 + index), filters.year])].sort((a, b) => b - a);
  const reportsLink = `/reports?${new URLSearchParams({ period: "custom", from: filters.period.from, to: filters.period.to })}`;

  return <>
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {data.metrics.slice(0, 4).map(metric => <Card key={metric.label}>
        <CardContent className="py-7!">
          <h2 className="text-base font-medium text-gray-700">{metric.label}</h2>
          <p className="mt-4 break-words text-2xl font-semibold text-gray-900 tabular">{metric.value}</p>
        </CardContent>
      </Card>)}
    </div>
    <p className="text-sm text-gray-600">Nilai sebelum pajak. Laba kotor belum dikurangi biaya operasional.</p>
    <Card className="min-w-0"><CardContent className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><h2 className="text-xl font-semibold text-gray-900">Penjualan Bulanan</h2><p className="mt-2 text-base text-gray-600">Januari sampai Desember {filters.year}</p></div>
        <form action="/dashboard" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value={filters.preset} />
          <input type="hidden" name="from" value={filters.period.from} />
          <input type="hidden" name="to" value={filters.period.to} />
          <FormField><Label htmlFor="sales-year">Tahun</Label><Select id="sales-year" name="year" defaultValue={filters.year}>{years.map(year => <option key={year} value={year}>{year}</option>)}</Select></FormField>
          <Button type="submit" variant="secondary">Tampilkan</Button>
        </form>
      </div>
      <MonthlySalesChart key={filters.year} points={data.monthly} />
    </CardContent></Card>
    <Card><CardContent>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-xl font-semibold text-gray-900">Produk Terlaris</h2><p className="mt-2 text-base text-gray-600">Berdasarkan jumlah terjual setelah retur.</p></div>
        <Link href={`${reportsLink}&tab=products`} className={linkClass}>Lihat Laporan</Link>
      </div>
      {!data.products.length ? <p className="py-8 text-base text-gray-600">Belum ada penjualan atau retur produk.</p> : <ol className="divide-y divide-gray-200">
        {data.products.map((product, index) => <li key={product.id} className="flex items-start gap-4 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-base font-semibold text-gray-700">{index + 1}</span>
          <div className="min-w-0 flex-1"><p className="break-words text-base font-medium text-gray-900">{product.name}</p></div>
          <p className="max-w-32 text-right text-base font-semibold text-gray-800 tabular">{product.quantity} <span className="font-normal">unit dasar</span></p>
        </li>)}
      </ol>}
    </CardContent></Card>
  </>;
}

async function LowStock() {
  let rows: Awaited<ReturnType<typeof getDashboardLowStock>>;
  try { rows = await getDashboardLowStock(); }
  catch { return <Card><CardContent><p role="alert" className="text-base text-gray-700">Daftar barang yang perlu diisi ulang belum dapat dimuat.</p></CardContent></Card>; }
  return <section aria-labelledby="low-stock-title" className="space-y-4"><div><h2 id="low-stock-title" className="text-xl font-semibold text-gray-900">Barang Perlu Diisi Ulang</h2><p className="mt-2 text-base text-gray-600">Barang aktif yang stoknya habis atau berada di bawah minimum.</p></div><Card><CardContent className="py-2!">{!rows.length ? <p className="py-7 text-base text-gray-600">Semua stok barang masih mencukupi.</p> : <ul className="divide-y divide-gray-200">{rows.map(row => <li key={row.id}><Link href={`/products/${row.id}`} className="grid gap-4 py-5 transition hover:bg-gray-50 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-3"><p className="break-words text-base font-semibold text-brand-600">{row.name}</p><div><p className="text-sm text-gray-500">Stok tersedia</p><p className="mt-1 text-base font-semibold text-gray-900 tabular">{row.availableStock.toLocaleString("id-ID")} {row.baseUnit}</p></div><div><p className="text-sm text-gray-500">Minimum stok</p><p className="mt-1 text-base font-medium text-gray-800 tabular">{row.minimumStock.toLocaleString("id-ID")} {row.baseUnit}</p></div><StockStatus active quantity={row.availableStock} minimum={row.minimumStock}/></Link></li>)}</ul>}</CardContent></Card></section>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardQuery> }) {
  const context = await getDashboardContext();
  const query = await searchParams;
  let filters: DashboardFilters | undefined;
  let filterError: string | undefined;
  if (context.financial) {
    try { filters = dashboardFilters(query); }
    catch (error) {
      filterError = error instanceof Error && error.message === "DASHBOARD_PERIOD_TOO_LONG"
        ? "Pilih rentang tanggal maksimal 366 hari."
        : "Tanggal atau tahun tidak valid. Periksa kembali pilihan Anda.";
    }
  }
  return <Container size="xl" className="space-y-8">
    {context.financial ? <>
      <h1 className="text-2xl font-semibold text-gray-900">Ringkasan Penjualan</h1>
      <PeriodControls query={query} filters={filters} />
      {filters ? <>
        <p className="text-base font-medium text-gray-700">{dateLabel(filters.period.from)} sampai {dateLabel(filters.period.to)}</p>
        <Suspense key={`${filters.period.from}-${filters.period.to}-${filters.year}`} fallback={<DashboardSkeleton />}><Analytics filters={filters} /></Suspense>
      </> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-base text-red-800">{filterError}</p>}
    </> : <Card><CardContent className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Selamat datang, {context.employee.name}</h1>
      <p className="text-base text-gray-700">{dateLabel(jakartaToday())}</p>
      <p className="text-base text-gray-700">{context.actions.length ? "Pilih kegiatan melalui menu di samping." : "Hubungi pengelola apotek untuk kegiatan dan akses kerja Anda."}</p>
    </CardContent></Card>}
    {context.stock ? <Suspense fallback={<Card><CardContent><p className="text-base text-gray-600">Memuat barang yang perlu diisi ulang...</p></CardContent></Card>}><LowStock /></Suspense> : null}
  </Container>;
}
