import Link from "next/link";
import type { AdminProductDetail } from "../data/admin-product-queries";
import { Card, CardContent, CardHeader } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";
import { hasDisplayValue, productLinkClass, productPrimaryLinkClass } from "./product-presentation";

// Pure server presentation: the full product is never passed to a Client Component.
export function ProductDetailSections({ product, owner, canViewSensitivePricing }: {
  product: AdminProductDetail; owner: boolean; canViewSensitivePricing: boolean;
}) {
  const classification = { otc: "Obat bebas", otc_limited: "Obat bebas terbatas", prescription_required: "Obat wajib resep" }[product.drugClassification];
  const optional = [
    { label: "Produsen", value: product.manufacturer },
    { label: "Pemasok utama", value: product.defaultSupplier },
    { label: "Lokasi penyimpanan", value: product.storageLocation },
  ].filter(item => hasDisplayValue(item.value));
  const information = [
    { label: "SKU", value: product.sku },
    { label: "Nama generik", value: product.genericName },
    { label: "Kategori", value: product.category },
    { label: "Subkategori", value: product.subcategory },
    { label: "Satuan dasar", value: product.baseUnit },
    { label: "Golongan obat", value: classification },
    { label: "Kebutuhan resep", value: product.requiresPrescription ? "Perlu resep" : "Tanpa resep" },
  ].filter(item => hasDisplayValue(item.value));

  return <>
    <Card><CardHeader><h2 className="text-lg font-semibold text-gray-900">Informasi Barang</h2></CardHeader><CardContent>
      <dl className="grid gap-6 text-base sm:grid-cols-2 xl:grid-cols-3">{information.map(item => <div key={item.label}><dt className="text-gray-600">{item.label}</dt><dd className="mt-2 break-words font-medium text-gray-900">{item.value}</dd></div>)}</dl>
    </CardContent></Card>

    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card className="min-w-0"><CardHeader><h2 className="text-lg font-semibold text-gray-900">Harga Jual</h2></CardHeader><CardContent className="space-y-5">
        <p className="break-words text-2xl font-semibold text-gray-900 tabular">{product.baseSellingPrice === null ? "Belum diatur" : formatRupiah(product.baseSellingPrice)}</p>
        <p className="text-base text-gray-700">per {product.baseUnit}</p>
        <dl className="text-base"><div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5"><dt className="text-gray-600">Pajak</dt><dd className="font-medium text-gray-900">{product.taxRate > 0 ? `${product.taxRate.toLocaleString("id-ID")}%` : "Tidak dikenakan"}</dd></div></dl>
        {canViewSensitivePricing ? <details className="border-t border-gray-200 pt-1"><summary className="min-h-13 cursor-pointer py-4 text-base font-medium text-gray-800">Harga Modal &amp; Margin</summary><dl className="grid gap-5 pb-3 text-base sm:grid-cols-2">
          {product.costPrice !== undefined ? <div><dt className="text-gray-600">Harga modal</dt><dd className="mt-2 break-words font-semibold text-gray-900 tabular">{formatRupiah(product.costPrice)}</dd></div> : null}
          <div><dt className="text-gray-600">Margin</dt><dd className="mt-2 font-semibold text-gray-900">{product.marginPercent === null || product.marginPercent === undefined ? "Belum dapat dihitung" : `${product.marginPercent.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</dd></div>
        </dl></details> : null}
      </CardContent></Card>

      <Card className="min-w-0"><CardHeader><h2 className="text-lg font-semibold text-gray-900">Stok Tersedia</h2></CardHeader><CardContent className="space-y-5">
        <p className="break-words text-2xl font-semibold text-gray-900 tabular">{product.availableStock.toLocaleString("id-ID")} <span className="text-base font-medium">{product.baseUnit}</span></p>
        {product.availableStock === 0 ? <p className="text-base font-medium text-red-800">Stok habis</p> : null}
        <dl className="text-base"><div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5"><dt className="text-gray-600">Stok minimum</dt><dd className="font-medium text-gray-900">{product.minimumStock.toLocaleString("id-ID")} {product.baseUnit}</dd></div></dl>
        {product.batches.length ? <details className="border-t border-gray-200 pt-1"><summary className="min-h-13 cursor-pointer py-4 text-base font-medium text-gray-800">Rincian Stok</summary><ul className="divide-y divide-gray-200">{product.batches.map(batch => <li key={batch.id} className="space-y-3 py-5">
          <p className="break-words text-base font-semibold text-gray-900">Nomor batch: {batch.batch_number}</p>
          <dl className="grid gap-4 text-base sm:grid-cols-2"><div><dt className="text-gray-600">Kedaluwarsa</dt><dd className="mt-1 text-gray-900">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${batch.expired_date}T00:00:00+07:00`))}</dd></div><div><dt className="text-gray-600">Jumlah</dt><dd className="mt-1 text-gray-900 tabular">{batch.quantity.toLocaleString("id-ID")} {product.baseUnit}</dd></div>{canViewSensitivePricing && batch.cost_price !== undefined ? <div><dt className="text-gray-600">Harga modal batch</dt><dd className="mt-1 text-gray-900 tabular">{formatRupiah(batch.cost_price)}</dd></div> : null}</dl>
        </li>)}</ul></details> : <p className="text-base text-gray-600">Belum ada stok yang belum kedaluwarsa.</p>}
      </CardContent></Card>
    </div>

    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-semibold text-gray-900">Satuan &amp; Barcode</h2>{owner ? <Link href={`/products/${product.id}/units/new`} className={productPrimaryLinkClass}>Tambah Satuan</Link> : null}</CardHeader>
      {product.units.length ? <ul className="divide-y divide-gray-200">{product.units.map(unit => <li key={unit.id} className="grid gap-5 px-5 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-gray-900">{unit.unit_name}</h3><p className="mt-2 text-base text-gray-700">{unit.is_base_unit ? "Satuan dasar" : `1 ${unit.unit_name} = ${unit.conversion_to_base.toLocaleString("id-ID")} ${product.baseUnit}`}</p>{hasDisplayValue(unit.barcode) ? <dl className="mt-4 text-base"><dt className="text-gray-600">Barcode</dt><dd className="mt-1 break-all font-medium text-gray-900">{unit.barcode}</dd></dl> : null}</div>
        <div><p className="text-base text-gray-600">Harga jual per {unit.unit_name}</p><p className="mt-2 break-words text-xl font-semibold text-gray-900 tabular">{formatRupiah(unit.selling_price)}</p></div>
        {owner ? <Link href={`/products/${product.id}/units/${unit.id}/edit`} className={`${productLinkClass} self-start`}>Ubah Satuan</Link> : null}
      </li>)}</ul> : <CardContent><p className="text-base text-gray-700">Belum ada satuan penjualan.</p></CardContent>}
    </Card>

    {optional.length || hasDisplayValue(product.description) ? <Card><CardHeader><h2 className="text-lg font-semibold text-gray-900">Informasi Tambahan</h2></CardHeader><CardContent className="space-y-6">
      {optional.length ? <dl className="grid gap-6 text-base sm:grid-cols-2 xl:grid-cols-3">{optional.map(item => <div key={item.label}><dt className="text-gray-600">{item.label}</dt><dd className="mt-2 break-words text-gray-900">{item.value}</dd></div>)}</dl> : null}
      {hasDisplayValue(product.description) ? <div><h3 className="text-base font-medium text-gray-700">Keterangan</h3><p className="mt-2 whitespace-pre-wrap break-words text-base text-gray-900">{product.description}</p></div> : null}
    </CardContent></Card> : null}
  </>;
}
