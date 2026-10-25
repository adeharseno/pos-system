import Link from "next/link";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { parseAdminProductFilters } from "@/modules/catalog/admin-product-filters";
import { listAdminProducts } from "@/modules/catalog/data/admin-product-queries";
import { formatRupiah } from "@/modules/ui/currency";
import { Button, Card, CardContent, Container, FormActions, Input, Select } from "@/modules/ui/components";

const status = (value: boolean) => (value ? "Aktif" : "Nonaktif");
const prescription = (value: boolean) => (value ? "Resep" : "Non-resep");

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const employee = await requirePosOperator();
  const filters = parseAdminProductFilters(await searchParams);
  const { rows, total } = await listAdminProducts(filters);
  const pages = Math.max(1, Math.ceil(total / filters.limit));
  const href = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "active") params.set("status", filters.status);
    if (filters.prescription !== "all") params.set("prescription", filters.prescription);
    if (page > 1) params.set("page", String(page));
    return `/products${params.size ? `?${params}` : ""}`;
  };

  return (
    <Container size="xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produk</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Lihat daftar produk dan stok yang tersedia.</p>
        </div>
        {employee.role === "owner_admin" ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/products/categories" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">Kelola Kategori</Link>
            <Link href="/products/subcategories" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">Kelola Subkategori</Link>
            <Link href="/products/taxes" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">Kelola Pajak</Link>
            <Link href="/products/import" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">Impor Produk</Link>
            <Link href="/products/new" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Tambah Produk</Link>
          </div>
        ) : null}
      </header>

      <Card className="mb-5">
        <CardContent>
          <form action="/products" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_210px_auto]">
            <Input name="q" defaultValue={filters.q} placeholder="Cari nama atau SKU" />
            <Select name="status" defaultValue={filters.status}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="all">Semua status</option></Select>
            <Select name="prescription" defaultValue={filters.prescription}><option value="all">Semua klasifikasi</option><option value="required">Perlu resep</option><option value="non_prescription">Non-resep</option></Select>
            <Button type="submit">Terapkan</Button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><h2>{total === 0 ? "Belum ada produk." : "Tidak ada produk yang cocok dengan filter."}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Produk akan muncul di sini setelah ditambahkan secara manual atau melalui impor massal.</p></CardContent></Card>
      ) : (
        <>
          <Card className="hidden md:block"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">SKU / Produk</th><th className="p-4">Kategori</th><th className="p-4">Unit dasar</th><th className="p-4">Harga Jual</th><th className="p-4">Resep</th><th className="p-4">Status</th><th className="p-4">Unit jual</th><th className="p-4">Stok</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="p-4"><Link href={`/products/${row.id}`} className="font-medium hover:underline">{row.name}</Link><p className="mt-1 text-[var(--text-muted)]">{row.sku}{row.genericName ? ` · ${row.genericName}` : ""}</p></td><td className="p-4">{row.category}<p className="mt-1 text-[var(--text-muted)]">{row.subcategory}</p></td><td className="p-4">{row.baseUnit}</td><td className="p-4">{row.baseSellingPrice===null?"—":formatRupiah(row.baseSellingPrice)}</td><td className="p-4">{prescription(row.requiresPrescription)}</td><td className="p-4">{status(row.isActive)}</td><td className="p-4">{row.unitCount}</td><td className="p-4">{row.availableStock}</td></tr>)}</tbody></table></div></Card>
          <div className="grid gap-3 md:hidden">{rows.map((row) => <Link key={row.id} href={`/products/${row.id}`}><Card><CardContent><strong>{row.name}</strong><p className="mt-1 text-sm text-[var(--text-muted)]">{row.sku} · {row.baseUnit}</p><p className="mt-1 text-sm">Harga jual: {row.baseSellingPrice===null?"—":formatRupiah(row.baseSellingPrice)}</p><p className="mt-1 text-sm">{row.unitCount} unit jual · Stok {row.availableStock}</p><p className="mt-1 text-sm">{row.category} · {prescription(row.requiresPrescription)}</p></CardContent></Card></Link>)}</div>
          <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total} produk · Halaman {filters.page} dari {pages}</span><FormActions className="border-0 pt-0"><Link href={href(filters.page - 1)} className="text-sm font-medium underline">Sebelumnya</Link><Link href={href(filters.page + 1)} className="text-sm font-medium underline">Berikutnya</Link></FormActions></nav>
        </>
      )}
    </Container>
  );
}
