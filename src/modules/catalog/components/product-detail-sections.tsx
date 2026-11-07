import Link from "next/link";

import type { AdminProductDetail } from "../data/admin-product-queries";
import { CATEGORY_LABEL, SUBCATEGORY_LABEL } from "../master-data-labels";
import { Card, CardContent, CardHeader } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";
import { hasDisplayValue, productLinkClass, productPrimaryLinkClass, StockStatus } from "./product-presentation";
import { formatStockMovementWib, type StockMovementRow } from "@/modules/inventory/data/stock-movement-read-model-parser";
import { stockMovementQuery, type StockMovementFilters } from "@/modules/inventory/stock-movement-filters";
import { StockMovementExportButton } from "@/modules/inventory/components/stock-movement-export-button";

export function ProductDetailSections({ product, owner, canViewSensitivePricing }: {
  product: AdminProductDetail;
  owner: boolean;
  canViewSensitivePricing: boolean;
}) {
  const classification = { otc: "Obat bebas", otc_limited: "Obat bebas terbatas", prescription_required: "Obat wajib resep" }[product.drugClassification];
  const information = [
    { label: "Nama generik", value: product.genericName },
    { label: CATEGORY_LABEL, value: product.category },
    { label: SUBCATEGORY_LABEL, value: product.subcategory },
    { label: "Golongan obat", value: classification },
    { label: "Kebutuhan resep", value: product.requiresPrescription ? "Perlu resep" : "Tanpa resep" },
    { label: "Produsen", value: product.manufacturer },
    { label: "Pemasok utama", value: product.defaultSupplier ?? product.legacySupplierText },
    { label: "Lokasi penyimpanan", value: product.storageLocation },
  ].filter(item => hasDisplayValue(item.value));

  return <div className="grid gap-6">
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card><CardHeader><h2 className="text-xl font-semibold text-gray-900">Informasi Barang</h2></CardHeader><CardContent className="space-y-6"><dl className="grid gap-5 text-base sm:grid-cols-2">{information.map(item => <div key={item.label}><dt className="text-gray-600">{item.label}</dt><dd className="mt-1 break-words font-medium text-gray-900">{item.value}</dd></div>)}</dl>{hasDisplayValue(product.description) ? <div className="border-t border-gray-200 pt-5"><h3 className="font-medium text-gray-700">Keterangan</h3><p className="mt-2 whitespace-pre-wrap break-words text-base text-gray-800">{product.description}</p></div> : null}</CardContent></Card>

      <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-gray-900">Harga &amp; Satuan</h2>{owner ? <Link href={`/products/${product.id}/units/new`} className={productPrimaryLinkClass}>Tambah Satuan</Link> : null}</CardHeader><CardContent className="space-y-6"><div><p className="text-sm text-gray-600">Harga jual satuan dasar</p><p className="mt-2 text-3xl font-semibold text-gray-900 tabular">{product.baseSellingPrice === null ? "Belum diatur" : formatRupiah(product.baseSellingPrice)}</p><p className="mt-1 text-base text-gray-600">per {product.baseUnit} · Pajak {product.taxRate > 0 ? `${product.taxRate.toLocaleString("id-ID")}%` : "tidak dikenakan"}</p></div>{canViewSensitivePricing ? <details className="border-y border-gray-200 py-1"><summary className="min-h-12 cursor-pointer py-3 text-base font-medium">Harga Modal &amp; Margin</summary><dl className="grid gap-4 pb-4 sm:grid-cols-2"><div><dt className="text-gray-600">Harga modal</dt><dd className="mt-1 font-semibold tabular">{product.costPrice === null || product.costPrice === undefined ? "Belum diatur" : formatRupiah(product.costPrice)}</dd></div><div><dt className="text-gray-600">Margin</dt><dd className="mt-1 font-semibold">{product.marginPercent === null || product.marginPercent === undefined ? "Belum dapat dihitung" : `${product.marginPercent.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</dd></div></dl></details> : null}<section aria-labelledby="units-title"><h3 id="units-title" className="text-lg font-semibold text-gray-900">Satuan &amp; Barcode</h3>{product.units.length ? <ul className="mt-3 divide-y divide-gray-200 border-y border-gray-200">{product.units.map(unit => <li key={unit.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold">{unit.unit_name}</p><p className="mt-1 text-sm text-gray-600">{unit.is_base_unit ? "Satuan dasar" : `1 ${unit.unit_name} = ${unit.conversion_to_base.toLocaleString("id-ID")} ${product.baseUnit}`}</p><p className="mt-1 break-all text-sm text-gray-600">Barcode: {hasDisplayValue(unit.barcode) ? unit.barcode : "Belum ada"}</p><p className="mt-1 font-medium tabular">{formatRupiah(unit.selling_price)}</p></div>{owner ? <Link href={`/products/${product.id}/units/${unit.id}/edit`} className={productLinkClass}>Ubah Satuan</Link> : null}</li>)}</ul> : <p className="mt-3 text-base text-gray-600">Belum ada satuan penjualan.</p>}</section></CardContent></Card>
    </div>

    <Card className="border-brand-100 bg-brand-50/30"><CardContent className="flex flex-wrap items-center justify-between gap-5"><div><h2 className="text-xl font-semibold text-gray-900">Ringkasan Stok</h2><div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-3xl font-bold text-gray-900 tabular">{product.availableStock.toLocaleString("id-ID")} <span className="text-xl font-semibold">{product.baseUnit}</span></p><StockStatus active={product.isActive} quantity={product.availableStock} minimum={product.minimumStock}/></div><p className="mt-2 text-base text-gray-600">Lihat batch, kedaluwarsa, dan riwayat pergerakan pada Detail Stok.</p></div><Link href={`/inventory/${product.id}`} className={productPrimaryLinkClass}>Lihat Detail Stok</Link></CardContent></Card>
  </div>;
}

export function StockMovementHistory({ productId, history, filters }: {
  productId: string;
  history: { rows: StockMovementRow[]; total: number; page: number; limit: number; error: boolean };
  filters: StockMovementFilters;
}) {
  const pages = Math.max(1, Math.ceil(history.total / history.limit));
  const pageHref = (page: number) => `/inventory/${productId}?${stockMovementQuery(filters, page)}#riwayat-pergerakan`;
  return <Card id="riwayat-pergerakan"><CardHeader><h2 className="text-xl font-semibold text-gray-900">Riwayat Pergerakan Barang</h2><p className="mt-2 text-base text-gray-600">Penjualan, penerimaan, retur, stock opname, dan tambah stok manual.</p></CardHeader><CardContent className="space-y-6">
    <form method="get" action={`/inventory/${productId}#riwayat-pergerakan`} className="grid gap-4 rounded-lg border border-gray-200 p-4 md:grid-cols-3 md:items-end"><label className="grid gap-2 text-base font-medium">Jenis pergerakan<select name="movementType" defaultValue={filters.movementType ?? ""} className="min-h-12 rounded-md border border-gray-300 bg-white px-3"><option value="">Semua</option><option value="sale">Penjualan</option><option value="void">Void</option><option value="invoice">Penerimaan Invoice</option><option value="customer_return">Retur Pelanggan</option><option value="supplier_return">Retur Pemasok</option><option value="stock_opname">Stock Opname</option><option value="manual_receiving">Tambah Stok Manual</option></select></label><label className="grid gap-2 text-base font-medium">Tanggal mulai<input name="startDate" type="date" defaultValue={filters.startDate ?? ""} className="min-h-12 rounded-md border border-gray-300 bg-white px-3" /></label><label className="grid gap-2 text-base font-medium">Tanggal akhir<input name="endDate" type="date" defaultValue={filters.endDate ?? ""} className="min-h-12 rounded-md border border-gray-300 bg-white px-3" /></label><div className="flex flex-wrap gap-3 md:col-span-3"><button type="submit" className={productPrimaryLinkClass}>Tampilkan</button><Link href={`/inventory/${productId}#riwayat-pergerakan`} className={productLinkClass}>Reset Filter</Link><StockMovementExportButton productId={productId} filters={filters}/></div></form>
    {history.error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-800">Riwayat belum dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p> : !history.rows.length ? <div className="py-5"><p className="text-lg font-semibold text-gray-900">Tidak ada riwayat sesuai filter.</p><p className="mt-2 text-base text-gray-600">Ubah atau reset filter untuk melihat pergerakan lainnya.</p></div> : <ul className="divide-y divide-gray-200">{history.rows.map(row => {
      const supplierReturn = row.type === "supplier_return";
      const stockOpname = row.type === "stock_opname_in" || row.type === "stock_opname_out";
      const incoming = row.type !== "out" && !supplierReturn && row.type !== "stock_opname_out";
      const label = row.type === "void" ? "Void · Stok Kembali" : row.type === "customer_return" ? "Retur Pelanggan · Stok Kembali" : supplierReturn ? "Retur Pemasok · Barang Keluar" : stockOpname ? "Penyesuaian Stock Opname" : row.type === "manual_receiving" ? "Tambah Stok Manual" : incoming ? "Barang Masuk" : "Barang Keluar";
      const actor = row.supplierName ?? row.employeeName ?? "Petugas tidak tercatat";
      return <li key={row.eventId} className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-3"><span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${row.type === "void" ? "bg-amber-50 text-amber-800" : incoming ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{label}</span><time dateTime={row.occurredAt} className="text-base text-gray-700">{formatStockMovementWib(row.occurredAt)} WIB</time></div><p className="mt-3 text-base text-gray-600">{row.supplierName ? `Pemasok: ${actor}` : `Petugas: ${actor}`}</p>{row.supplierName && row.employeeName ? <p className="mt-1 text-sm text-gray-500">Diproses oleh {row.employeeName}</p> : null}{row.batchNumber ? <p className="mt-1 text-sm text-gray-500">Batch: {row.batchNumber}</p> : null}{row.reason ? <p className="mt-1 text-sm text-gray-500">Alasan: {row.reason}</p> : null}</div><p className={`text-2xl font-bold tabular ${incoming ? "text-emerald-700" : "text-red-700"}`}>{incoming ? "+" : "−"}{row.quantity.toLocaleString("id-ID")} <span className="text-base font-semibold">{row.unit}</span></p>{row.referenceUrl && row.referenceNumber ? <Link href={row.referenceUrl} className={productLinkClass}>Referensi {row.referenceNumber}</Link> : row.referenceNumber ? <p className="text-base font-medium text-gray-700">Referensi {row.referenceNumber}</p> : null}</li>;
    })}</ul>}
    {!history.error && history.total > 0 ? <nav aria-label="Halaman riwayat pergerakan barang" className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-5"><p className="text-base text-gray-700">{history.total.toLocaleString("id-ID")} pergerakan · Halaman {history.page} dari {pages}</p><div className="flex flex-wrap gap-3">{history.page > 1 ? <Link href={pageHref(history.page - 1)} className={productLinkClass}>Sebelumnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Sebelumnya</span>}{history.page < pages ? <Link href={pageHref(history.page + 1)} className={productLinkClass}>Berikutnya</Link> : <span aria-disabled="true" className={`${productLinkClass} opacity-50`}>Berikutnya</span>}</div></nav> : null}
  </CardContent></Card>;
}
