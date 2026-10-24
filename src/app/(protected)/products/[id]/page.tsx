import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { DeactivateProductButton } from "@/modules/catalog/components/deactivate-product-button";
import { getAdminProduct } from "@/modules/catalog/data/admin-product-queries";
import { canViewSensitiveProductPricing } from "@/modules/catalog/product-pricing-access";
import { requireUuid } from "@/modules/shared/validation/input";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requirePosOperator();
  const { id } = await params;
  let productId: string;
  try { productId = requireUuid(id, "productId"); } catch { notFound(); }
  const canViewSensitivePricing = canViewSensitiveProductPricing(employee.role);
  const product = await getAdminProduct(productId, canViewSensitivePricing);
  if (!product) notFound();
  const owner = employee.role === "owner_admin";

  return <Container size="xl">
    <Link href="/products" className="text-sm font-semibold underline">← Kembali ke Produk</Link>
    <header className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{product.name}</h1><p className="mt-1 text-sm text-[var(--text-muted)]">{product.sku}{product.genericName ? ` · ${product.genericName}` : ""}</p></div><div className="flex flex-wrap gap-2"><span className="inline-flex min-h-9 items-center rounded-[var(--radius)] bg-[var(--surface-subtle)] px-3 text-sm font-semibold">{product.isActive ? "Aktif" : "Nonaktif"}</span>{owner ? <>{product.isActive ? <Link href={`/inventory/receive?product_id=${product.id}`} className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-sm font-medium">Terima Stok</Link> : null}<Link href={`/products/${product.id}/edit`} className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-sm font-medium">Edit Produk</Link>{product.isActive ? <DeactivateProductButton productId={product.id} /> : null}</> : null}</div></header>
    <Card><CardHeader><h2 className="font-semibold">Informasi Produk</h2></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["Kategori", `${product.category} · ${product.subcategory}`],["Unit dasar", product.baseUnit],["Resep", product.requiresPrescription ? "Wajib resep" : "Non-resep"],["Manufacturer", product.manufacturer ?? "—"],["Supplier default", product.defaultSupplier ?? "—"],["Lokasi penyimpanan", product.storageLocation ?? "—"],["Minimum stok", product.minimumStock],["Harga Jual", product.baseSellingPrice===null?"—":formatRupiah(product.baseSellingPrice)],["Pajak", product.taxRate > 0 ? `${product.taxRate}%` : "Tidak dikenakan"],...(canViewSensitivePricing?[["Harga Modal",formatRupiah(product.costPrice??0)],["Margin",product.marginPercent===null||product.marginPercent===undefined?"—":`${product.marginPercent.toFixed(2)}%`]]:[])].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--text-muted)]">{label}</dt><dd className="mt-1">{value}</dd></div>)}</dl>{product.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{product.description}</p> : null}</CardContent></Card>
    <Card className="mt-5"><CardHeader className="flex items-center justify-between gap-3"><h2 className="font-semibold">Unit Penjualan</h2>{owner ? <Link href={`/products/${product.id}/units/new`} className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent)] px-3 text-sm font-medium text-white">Tambah Unit</Link> : null}</CardHeader><CardContent className="p-0">{product.units.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Belum ada unit penjualan.</p> : <div className="divide-y divide-[var(--border)]">{product.units.map((unit) => <div key={unit.id} className="grid gap-2 p-5 text-sm sm:grid-cols-5"><strong>{unit.unit_name}{unit.is_base_unit ? " · Unit dasar" : ""}</strong><span>Konversi: {unit.conversion_to_base}</span><span>{formatRupiah(unit.selling_price)}</span><span>Barcode: {unit.barcode ?? "—"}</span>{owner ? <Link className="font-medium underline" href={`/products/${product.id}/units/${unit.id}/edit`}>Edit</Link> : null}</div>)}</div>}</CardContent></Card>
    <Card className="mt-5"><CardHeader><h2 className="font-semibold">Ringkasan Batch / Inventori</h2></CardHeader><CardContent className="p-0">{product.batches.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Tidak ada batch tersedia yang belum kedaluwarsa.</p> : <div className="divide-y divide-[var(--border)]">{product.batches.map((batch) => <div key={batch.id} className={`grid gap-2 p-5 text-sm ${canViewSensitivePricing?"sm:grid-cols-4":"sm:grid-cols-3"}`}><strong>{batch.batch_number}</strong><span>Kedaluwarsa: {batch.expired_date}</span><span>Qty: {batch.quantity}</span>{canViewSensitivePricing&&batch.cost_price!==undefined?<span>Modal: {formatRupiah(batch.cost_price)}</span>:null}</div>)}</div>}</CardContent></Card>
  </Container>;
}
