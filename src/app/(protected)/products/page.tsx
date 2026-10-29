import Link from "next/link";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { parseAdminProductFilters } from "@/modules/catalog/admin-product-filters";
import { listAdminProducts, type AdminProductListItem } from "@/modules/catalog/data/admin-product-queries";
import { StockStatus, productLinkClass, productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";
import { formatRupiah } from "@/modules/ui/currency";
import { Button, Card, CardContent, Container, FormField, Input, Label } from "@/modules/ui/components";
import { EyeIcon, PencilIcon } from "@/modules/ui/icons";

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
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-gray-900">Daftar Barang</h1>{owner ? <div className="flex flex-wrap items-start gap-3"><Link href="/products/new" className={productLinkClass}>Tambah Master Produk</Link><Link href="/purchase-invoices/new" className={productPrimaryLinkClass}>Terima Barang</Link></div> : null}</header>
    {owner ? <Card><CardContent className="space-y-4"><h2 className="text-lg font-semibold">Pengaturan Barang</h2><nav aria-label="Pengaturan barang" className="flex flex-wrap gap-3">{[["categories", "Kelola Kategori"], ["subcategories", "Kelola Subkategori"], ["taxes", "Kelola Pajak"], ["suppliers", "Kelola Pemasok"], ["import", "Impor Barang"]].map(([path, label]) => <Link key={path} href={`/products/${path}`} className={productLinkClass}>{label}</Link>)}</nav></CardContent></Card> : null}
    <Card><CardContent className="space-y-5">
      <form key={href(filters.page)} action="/products" className="flex flex-col gap-4 sm:flex-row sm:items-end"><FormField className="min-w-0 flex-1"><Label htmlFor="product-search">Cari nama barang / SKU / barcode</Label><Input id="product-search" name="q" defaultValue={filters.q} placeholder="Nama barang, SKU, atau barcode" maxLength={80} /></FormField><Button type="submit">Cari Barang</Button><Link href="/products" className={productLinkClass}>Atur Ulang</Link></form>
    </CardContent></Card>

    {error ? <Card><CardContent><p role="alert" className="text-base text-red-800">Daftar barang belum dapat dimuat. Pilihan pencarian tetap tersimpan.</p><div className="mt-5 flex flex-wrap gap-3"><Link href={href(filters.page)} className={productLinkClass}>Coba Lagi</Link>{filters.page > 1 ? <Link href={href(1)} className={productLinkClass}>Ke Halaman Pertama</Link> : null}</div></CardContent></Card> : <>
      {!rows.length ? <Card><CardContent className="space-y-4 py-10!">
        <h2 className="text-xl font-semibold text-gray-900">{total > 0 ? "Tidak ada barang di halaman ini." : filtered ? "Tidak ada barang yang cocok." : "Belum ada barang aktif."}</h2>
        <p className="text-base text-gray-600">Coba nama barang, SKU, atau barcode lain.</p>
        {filters.page > 1 ? <Link href={href(1)} className={productLinkClass}>Ke Halaman Pertama</Link> : null}
      </CardContent></Card> : <>
        <Card className="hidden lg:block"><div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-left text-sm">
          <caption className="sr-only">Daftar barang apotek, harga jual dan stok tersedia</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-700"><tr><th scope="col" className="w-14 px-4 py-4 font-medium">No</th><th scope="col" className="min-w-56 px-4 py-4 font-medium">Nama Barang</th><th scope="col" className="min-w-32 px-4 py-4 font-medium">SKU</th><th scope="col" className="min-w-36 px-4 py-4 font-medium">Kategori</th><th scope="col" className="min-w-28 px-4 py-4 font-medium">Stok</th><th scope="col" className="min-w-32 px-4 py-4 font-medium">Minimum Stok</th><th scope="col" className="min-w-36 px-4 py-4 font-medium">Status Stok</th><th scope="col" className="min-w-36 px-4 py-4 font-medium">Harga Jual</th><th scope="col" className="w-28 px-4 py-4 text-center font-medium">Aksi</th></tr></thead>
          <tbody className="divide-y divide-gray-200">{rows.map((row, index) => <tr key={row.id} className="text-gray-800 hover:bg-gray-50/60">
            <td className="px-4 py-5 text-gray-600 tabular">{(filters.page - 1) * filters.limit + index + 1}</td>
            <td className="px-4 py-5"><Link href={`/products/${row.id}`} className="font-semibold text-brand-600 hover:underline">{row.name}</Link></td>
            <td className="px-4 py-5 break-all text-gray-700">{row.sku}</td>
            <td className="px-4 py-5 text-gray-700">{row.category}</td>
            <td className="px-4 py-5 font-medium tabular">{row.availableStock.toLocaleString("id-ID")} {row.baseUnit}</td>
            <td className="px-4 py-5 text-gray-700 tabular">{row.minimumStock.toLocaleString("id-ID")} {row.baseUnit}</td>
            <td className="px-4 py-5"><StockStatus active={row.isActive} quantity={row.availableStock} minimum={row.minimumStock} /></td>
            <td className="px-4 py-5"><p className="font-semibold text-gray-900 tabular">{row.baseSellingPrice === null ? "Belum diatur" : formatRupiah(row.baseSellingPrice)}</p><p className="mt-1 text-xs text-gray-500">per {row.baseUnit}</p></td>
            <td className="px-4 py-5"><div className="flex items-center justify-center gap-1"><Link href={`/products/${row.id}`} aria-label={`Lihat detail ${row.name}`} title="Detail" className="inline-flex size-11 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-brand-600"><EyeIcon /></Link>{owner ? <Link href={`/products/${row.id}/edit`} aria-label={`Edit ${row.name}`} title="Edit" className="inline-flex size-11 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-brand-600"><PencilIcon /></Link> : null}</div></td>
          </tr>)}</tbody>
        </table></div></Card>
        <div className="grid gap-5 lg:hidden">{rows.map((row, index) => <Card key={row.id}><CardContent className="space-y-5">
          <div className="flex items-start gap-3"><span className="pt-0.5 text-sm text-gray-500 tabular">{(filters.page - 1) * filters.limit + index + 1}.</span><div className="min-w-0 flex-1"><Link href={`/products/${row.id}`} className="break-words text-lg font-semibold text-brand-600 hover:underline">{row.name}</Link><p className="mt-1 break-all text-sm text-gray-600">SKU: {row.sku}</p></div><StockStatus active={row.isActive} quantity={row.availableStock} minimum={row.minimumStock} /></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm"><div><dt className="text-gray-500">Kategori</dt><dd className="mt-1 font-medium text-gray-800">{row.category}</dd></div><div><dt className="text-gray-500">Harga Jual</dt><dd className="mt-1 font-semibold text-gray-900 tabular">{row.baseSellingPrice === null ? "Belum diatur" : formatRupiah(row.baseSellingPrice)}</dd><dd className="mt-0.5 text-xs text-gray-500">per {row.baseUnit}</dd></div><div><dt className="text-gray-500">Stok</dt><dd className="mt-1 font-semibold text-gray-900 tabular">{row.availableStock.toLocaleString("id-ID")} {row.baseUnit}</dd></div><div><dt className="text-gray-500">Minimum Stok</dt><dd className="mt-1 font-medium text-gray-800 tabular">{row.minimumStock.toLocaleString("id-ID")} {row.baseUnit}</dd></div></dl>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4"><Link href={`/products/${row.id}`} aria-label={`Lihat detail ${row.name}`} title="Detail" className="inline-flex size-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><EyeIcon /></Link>{owner ? <Link href={`/products/${row.id}/edit`} aria-label={`Edit ${row.name}`} title="Edit" className="inline-flex size-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><PencilIcon /></Link> : null}</div>
        </CardContent></Card>)}</div>
      </>}
      {total > 0 ? <nav aria-label="Halaman daftar barang" className="flex flex-wrap items-center justify-between gap-5"><p className="text-base text-gray-700">{total.toLocaleString("id-ID")} barang · Halaman {filters.page} dari {pages}</p><div className="flex flex-wrap gap-3">{filters.page > 1 ? <Link href={href(filters.page - 1)} className={productLinkClass}>Sebelumnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Sebelumnya</span>}{filters.page < pages ? <Link href={href(filters.page + 1)} className={productLinkClass}>Berikutnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Berikutnya</span>}</div></nav> : null}
    </>}
  </Container>;
}
