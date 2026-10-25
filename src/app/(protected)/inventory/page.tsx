import Link from "next/link";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { listInventoryOverview, parseInventoryOverviewFilters, type InventoryStockStatus } from "@/modules/inventory/data/inventory-overview-queries";
import { Button, Card, CardContent, Container, Input, Select } from "@/modules/ui/components";

const statusLabel: Record<InventoryStockStatus, string> = { out: "Habis", low: "Stok Menipis", safe: "Aman" };
const statusClass: Record<InventoryStockStatus, string> = { out: "bg-[var(--danger-soft)] text-[var(--danger)]", low: "bg-amber-100 text-amber-800", safe: "bg-emerald-100 text-emerald-800" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePosOperator();
  const filters = parseInventoryOverviewFilters(await searchParams);
  const rows = await listInventoryOverview(filters);

  return <Container size="xl">
    <header className="mb-6"><h1 className="text-2xl font-bold">Persediaan</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Ketersediaan stok produk berdasarkan batch yang belum kedaluwarsa.</p></header>
    <Card className="mb-5"><CardContent><form action="/inventory" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto]"><Input name="q" defaultValue={filters.q} placeholder="Cari nama atau SKU" /><Select name="status" defaultValue={filters.status}><option value="all">Semua status</option><option value="out">Habis</option><option value="low">Stok Menipis</option><option value="safe">Aman</option></Select><Button type="submit">Terapkan</Button></form></CardContent></Card>
    {rows.length === 0 ? <Card><CardContent className="p-8 text-center"><h2>Tidak ada produk yang cocok.</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Ubah pencarian atau filter stok untuk melihat produk lain.</p></CardContent></Card> : <>
      <Card className="hidden md:block"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Produk / SKU</th><th className="p-4">Kategori</th><th className="p-4">Unit Dasar</th><th className="p-4">Stok Tersedia</th><th className="p-4">Minimum Stok</th><th className="p-4">Status Stok</th><th className="p-4">Kedaluwarsa Terdekat</th><th className="p-4">Aksi</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-4"><strong>{row.name}</strong><p className="mt-1 text-[var(--text-muted)]">{row.sku}</p></td><td className="p-4">{row.category}</td><td className="p-4">{row.baseUnit}</td><td className="p-4">{row.availableStock}</td><td className="p-4">{row.minimumStock}</td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[row.stockStatus]}`}>{statusLabel[row.stockStatus]}</span></td><td className="p-4">{row.nearestExpiry ?? "—"}</td><td className="p-4"><Link href={`/inventory/${row.id}`} className="font-medium underline">Lihat detail</Link></td></tr>)}</tbody></table></div></Card>
      <div className="grid gap-3 md:hidden">{rows.map((row) => <Card key={row.id}><CardContent><div className="flex items-start justify-between gap-3"><div><strong>{row.name}</strong><p className="mt-1 text-sm text-[var(--text-muted)]">{row.sku} · {row.category}</p></div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[row.stockStatus]}`}>{statusLabel[row.stockStatus]}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">Stok tersedia</dt><dd>{row.availableStock} {row.baseUnit}</dd></div><div><dt className="text-[var(--text-muted)]">Minimum stok</dt><dd>{row.minimumStock}</dd></div><div><dt className="text-[var(--text-muted)]">Kedaluwarsa terdekat</dt><dd>{row.nearestExpiry ?? "—"}</dd></div></dl><Link href={`/inventory/${row.id}`} className="mt-4 inline-block text-sm font-medium underline">Lihat detail</Link></CardContent></Card>)}</div>
    </>}
  </Container>;
}
