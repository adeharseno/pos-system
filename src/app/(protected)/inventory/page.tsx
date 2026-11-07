import Link from "next/link";
import { requireRole } from "@/modules/auth/application/auth-service";
import { listInventoryOverview, parseInventoryOverviewFilters, type InventoryStockStatus } from "@/modules/inventory/data/inventory-overview-queries";
import { Button, Card, CardContent, Container, FormField, Input, Label } from "@/modules/ui/components";
import { SearchForm } from "@/modules/ui/search-form";

const statusLabel: Record<InventoryStockStatus, string> = { out: "Habis", low: "Menipis", normal: "Tersedia" };
const statusClass: Record<InventoryStockStatus, string> = { out: "bg-[var(--danger-soft)] text-[var(--danger)]", low: "bg-amber-100 text-amber-800", normal: "bg-emerald-100 text-emerald-800" };
const pageLinkClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium";
const formatExpiry = (value: string | null) => value
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${value}T00:00:00+07:00`))
  : "Belum ada";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const employee = await requireRole(["owner_admin"]);
  const parsedFilters = parseInventoryOverviewFilters(await searchParams);
  const filters = { ...parsedFilters, status: "all" as const };
  const { rows, total } = await listInventoryOverview(filters);
  const pages = Math.max(1, Math.ceil(total / filters.limit));
  const href = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (page > 1) params.set("page", String(page));
    return `/inventory${params.size ? `?${params}` : ""}`;
  };

  return <Container size="xl">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Manajemen Stok</h1><p className="mt-2 text-base text-[var(--text-muted)]">Pantau ketersediaan stok dan kedaluwarsa barang.</p></div>{employee.role === "owner_admin" ? <Link href="/inventory/receive" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--accent)] px-5 py-3 text-base font-semibold text-white">Terima Barang</Link> : null}</header>
    <Card className="mb-5"><CardContent><SearchForm key={href(filters.page)} action="/inventory" className="flex flex-col gap-4 sm:flex-row sm:items-end"><FormField className="min-w-0 flex-1"><Label htmlFor="inventory-search">Cari nama barang, SKU, atau barcode</Label><Input id="inventory-search" name="q" defaultValue={filters.q} placeholder="Ketik nama barang, SKU, atau barcode" maxLength={80}/></FormField><Button type="submit">Cari Barang</Button><Link href="/inventory" className={pageLinkClass}>Atur Ulang</Link></SearchForm></CardContent></Card>
    {total === 0 ? <Card><CardContent className="p-8 text-center"><h2>Tidak ada barang yang cocok.</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Coba gunakan nama barang, SKU, atau barcode lain.</p></CardContent></Card> : <>
      {rows.length === 0 ? <Card><CardContent className="p-8 text-center"><h2>Tidak ada produk di halaman ini.</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Halaman ini berada di luar jumlah hasil yang tersedia.</p><Link href={href(1)} className={`${pageLinkClass} mt-5`}>Ke Halaman Pertama</Link></CardContent></Card> : <>
        <Card className="hidden md:block"><div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nama Barang</th><th className="p-4">SKU</th><th className="p-4">Stok Tersedia</th><th className="p-4">Minimum Stok</th><th className="p-4">Status Stok</th><th className="p-4">Kedaluwarsa Terdekat</th><th className="p-4">Aksi</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-4 font-semibold">{row.name}</td><td className="p-4 break-all text-[var(--text-muted)]">{row.sku}</td><td className="p-4 font-semibold tabular">{row.availableStock.toLocaleString("id-ID")} {row.baseUnit}</td><td className="p-4 tabular">{row.minimumStock.toLocaleString("id-ID")} {row.baseUnit}</td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[row.stockStatus]}`}>{statusLabel[row.stockStatus]}</span></td><td className="p-4">{formatExpiry(row.nearestExpiry)}</td><td className="p-4"><Link href={`/inventory/${row.id}`} className="font-medium text-brand-600 underline">Lihat detail</Link></td></tr>)}</tbody></table></div></Card>
        <div className="grid gap-3 md:hidden">{rows.map((row) => <Card key={row.id}><CardContent><div className="flex items-start justify-between gap-3"><div><strong>{row.name}</strong><p className="mt-1 break-all text-sm text-[var(--text-muted)]">SKU: {row.sku}</p></div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[row.stockStatus]}`}>{statusLabel[row.stockStatus]}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">Stok tersedia</dt><dd className="mt-1 font-semibold">{row.availableStock.toLocaleString("id-ID")} {row.baseUnit}</dd></div><div><dt className="text-[var(--text-muted)]">Minimum stok</dt><dd className="mt-1">{row.minimumStock.toLocaleString("id-ID")} {row.baseUnit}</dd></div><div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">Kedaluwarsa terdekat</dt><dd className="mt-1">{formatExpiry(row.nearestExpiry)}</dd></div></dl><Link href={`/inventory/${row.id}`} className="mt-4 inline-flex min-h-11 items-center font-medium text-brand-600 underline">Lihat detail</Link></CardContent></Card>)}</div>
      </>}
      <nav aria-label="Halaman manajemen stok" className="mt-5 flex flex-wrap items-center justify-between gap-5"><p className="text-sm text-[var(--text-muted)]">{total.toLocaleString("id-ID")} barang · Halaman {filters.page} dari {pages}</p><div className="flex flex-wrap gap-3">{filters.page > 1 ? <Link href={href(filters.page - 1)} className={pageLinkClass}>Sebelumnya</Link> : <span aria-disabled="true" className={`${pageLinkClass} opacity-50`}>Sebelumnya</span>}{filters.page < pages ? <Link href={href(filters.page + 1)} className={pageLinkClass}>Berikutnya</Link> : <span aria-disabled="true" className={`${pageLinkClass} opacity-50`}>Berikutnya</span>}</div></nav>
    </>}
  </Container>;
}
