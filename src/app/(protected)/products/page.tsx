import Link from "next/link";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { parseAdminProductFilters } from "@/modules/catalog/admin-product-filters";
import { listAdminProducts, type AdminProductListItem } from "@/modules/catalog/data/admin-product-queries";
import { ProductBarcodeLookup } from "@/modules/catalog/components/product-barcode-lookup";
import { ProductStatus, StockValue, hasDisplayValue, productLinkClass, productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";
import { formatRupiah } from "@/modules/ui/currency";
import { Button, Card, CardContent, Container, FormField, Input, Label, Select } from "@/modules/ui/components";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const employee = await requirePosOperator();
  const filters = parseAdminProductFilters(await searchParams);
  const owner = employee.role === "owner_admin";
  let rows: AdminProductListItem[] = [];
  let total = 0;
  let error = false;
  try { ({ rows, total } = await listAdminProducts(filters)); }
  catch { error = true; }
  const pages = Math.max(1, Math.ceil(total / filters.limit));
  const href = (page: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "active") params.set("status", filters.status);
    if (filters.prescription !== "all") params.set("prescription", filters.prescription);
    if (page > 1) params.set("page", String(page));
    return `/products${params.size ? `?${params}` : ""}`;
  };
  const filtered = Boolean(filters.q || filters.status !== "active" || filters.prescription !== "all");

  return <Container size="xl" className="space-y-7">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-gray-900">Daftar Barang</h1>{owner ? <Link href="/products/new" className={productPrimaryLinkClass}>Tambah Barang</Link> : null}</header>
    <Card><CardContent className="space-y-5">
      <form id="product-filters" key={href(filters.page)} action="/products" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <FormField className="min-w-0 sm:col-span-2 xl:col-span-1"><Label htmlFor="product-search">Cari nama atau SKU</Label><Input id="product-search" name="q" defaultValue={filters.q} placeholder="Nama barang atau SKU" maxLength={80} /></FormField>
        <FormField><Label htmlFor="product-status">Status barang</Label><Select id="product-status" name="status" defaultValue={filters.status}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="all">Semua status</option></Select></FormField>
        <FormField><Label htmlFor="product-prescription">Kebutuhan resep</Label><Select id="product-prescription" name="prescription" defaultValue={filters.prescription}><option value="all">Semua barang</option><option value="required">Perlu resep</option><option value="non_prescription">Tanpa resep</option></Select></FormField>
      </form>
      <div className="flex flex-wrap gap-3"><Button form="product-filters" type="submit">Cari Barang</Button><Link href="/products" className={productLinkClass}>Atur Ulang</Link><ProductBarcodeLookup /></div>
    </CardContent></Card>

    {error ? <Card><CardContent><p role="alert" className="text-base text-red-800">Daftar barang belum dapat dimuat. Pilihan pencarian tetap tersimpan.</p><div className="mt-5 flex flex-wrap gap-3"><Link href={href(filters.page)} className={productLinkClass}>Coba Lagi</Link>{filters.page > 1 ? <Link href={href(1)} className={productLinkClass}>Ke Halaman Pertama</Link> : null}</div></CardContent></Card> : <>
      {!rows.length ? <Card><CardContent className="space-y-4 py-10!">
        <h2 className="text-xl font-semibold text-gray-900">{total > 0 ? "Tidak ada barang di halaman ini." : filtered ? "Tidak ada barang yang cocok." : "Belum ada barang aktif."}</h2>
        <p className="text-base text-gray-600">Coba nama lain atau ubah pilihan status dan resep.</p>
        {filters.page > 1 ? <Link href={href(1)} className={productLinkClass}>Ke Halaman Pertama</Link> : null}
      </CardContent></Card> : <>
        <Card className="hidden xl:block"><table className="w-full table-fixed text-left text-base">
          <caption className="sr-only">Daftar barang apotek, harga jual dan stok tersedia</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-700"><tr><th scope="col" className="w-[32%] px-5 py-5 font-medium">Barang</th><th scope="col" className="w-[22%] px-4 py-5 font-medium">Harga jual</th><th scope="col" className="w-[19%] px-4 py-5 font-medium">Stok tersedia</th><th scope="col" className="w-[14%] px-4 py-5 font-medium">Status</th><th scope="col" className="w-[13%] px-4 py-5 font-medium"><span className="sr-only">Tindakan</span></th></tr></thead>
          <tbody className="divide-y divide-gray-200">{rows.map(row => <tr key={row.id} className="align-top text-gray-800 hover:bg-gray-50/60">
            <td className="px-5 py-6"><Link href={`/products/${row.id}`} className="inline-flex min-h-12 items-center break-words text-base font-semibold text-brand-600 underline decoration-brand-300 underline-offset-4">{row.name}</Link><p className="mt-2 break-all text-sm text-gray-600">SKU: {row.sku}</p>{hasDisplayValue(row.genericName) ? <p className="mt-1 break-words text-sm text-gray-600">{row.genericName}</p> : null}<p className="mt-2 break-words text-sm text-gray-600">{row.category}{hasDisplayValue(row.subcategory) ? ` / ${row.subcategory}` : ""}</p>{row.requiresPrescription ? <p className="mt-2 text-sm font-medium text-gray-800">Perlu resep</p> : null}</td>
            <td className="px-4 py-6"><p className="break-words text-base font-semibold text-gray-900 tabular">{row.baseSellingPrice === null ? "Belum diatur" : formatRupiah(row.baseSellingPrice)}</p><p className="mt-2 break-words text-sm text-gray-600">per {row.baseUnit}</p><p className="mt-2 text-sm text-gray-600">{row.unitCount} satuan jual</p></td>
            <td className="px-4 py-6"><StockValue quantity={row.availableStock} unit={row.baseUnit} /></td>
            <td className="px-4 py-6"><ProductStatus active={row.isActive} /></td>
            <td className="px-4 py-6"><Link href={`/products/${row.id}`} aria-label={`Lihat detail ${row.name}`} className={`${productLinkClass} px-3! text-sm!`}>Detail</Link></td>
          </tr>)}</tbody>
        </table></Card>
        <div className="grid gap-5 xl:hidden">{rows.map(row => <Link key={row.id} href={`/products/${row.id}`} aria-label={`Lihat detail ${row.name}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-500"><Card className="transition hover:border-brand-300"><CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 break-words text-lg font-semibold text-gray-900">{row.name}</h2><ProductStatus active={row.isActive} /></div>
          <p className="break-all text-sm text-gray-600">SKU: {row.sku}</p>
          {hasDisplayValue(row.genericName) ? <p className="break-words text-base text-gray-700">{row.genericName}</p> : null}
          <div className="grid gap-5 sm:grid-cols-2"><div><p className="text-base text-gray-600">Harga jual</p><p className="mt-1 break-words text-xl font-semibold text-gray-900 tabular">{row.baseSellingPrice === null ? "Belum diatur" : formatRupiah(row.baseSellingPrice)}</p><p className="mt-1 text-sm text-gray-600">per {row.baseUnit} · {row.unitCount} satuan jual</p></div><div><p className="mb-1 text-base text-gray-600">Stok tersedia</p><StockValue quantity={row.availableStock} unit={row.baseUnit} /></div></div>
          <p className="break-words text-base text-gray-700">{row.category}{hasDisplayValue(row.subcategory) ? ` / ${row.subcategory}` : ""}{row.requiresPrescription ? " · Perlu resep" : ""}</p>
          <span className="flex min-h-12 items-center justify-center rounded-lg border border-gray-300 text-base font-medium text-gray-800">Lihat Detail</span>
        </CardContent></Card></Link>)}</div>
      </>}
      {total > 0 ? <nav aria-label="Halaman daftar barang" className="flex flex-wrap items-center justify-between gap-5"><p className="text-base text-gray-700">{total.toLocaleString("id-ID")} barang · Halaman {filters.page} dari {pages}</p><div className="flex flex-wrap gap-3">{filters.page > 1 ? <Link href={href(filters.page - 1)} className={productLinkClass}>Sebelumnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Sebelumnya</span>}{filters.page < pages ? <Link href={href(filters.page + 1)} className={productLinkClass}>Berikutnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Berikutnya</span>}</div></nav> : null}
    </>}
    {owner ? <details className="rounded-xl border border-gray-200 bg-white px-5"><summary className="min-h-14 cursor-pointer py-4 text-base font-medium text-gray-800">Pengaturan Barang</summary><nav aria-label="Pengaturan barang" className="grid gap-3 border-t border-gray-200 py-5 sm:grid-cols-2 xl:grid-cols-4"><Link href="/products/categories" className={productLinkClass}>Kelola Kategori</Link><Link href="/products/subcategories" className={productLinkClass}>Kelola Subkategori</Link><Link href="/products/taxes" className={productLinkClass}>Kelola Pajak</Link><Link href="/products/import" className={productLinkClass}>Impor Barang</Link></nav></details> : null}
  </Container>;
}
