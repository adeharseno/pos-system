import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { StockMovementHistory } from "@/modules/catalog/components/product-detail-sections";
import { productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";
import { canViewSensitiveProductPricing } from "@/modules/catalog/product-pricing-access";
import { getInventoryProductDetail } from "@/modules/inventory/data/inventory-detail-queries";
import { listProductStockMovements, type StockMovementRow } from "@/modules/inventory/data/stock-movement-read-model";
import { parseStockMovementFilters } from "@/modules/inventory/stock-movement-filters";
import { EXPIRING_SOON_DAYS, type InventoryExpiryStatus, type InventoryStockStatus } from "@/modules/inventory/inventory-rules";
import { requireUuid } from "@/modules/shared/validation/input";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";

const stockLabel: Record<InventoryStockStatus, string> = { out: "Habis", low: "Menipis", normal: "Tersedia" };
const stockClass: Record<InventoryStockStatus, string> = { out: "bg-red-50 text-red-700", low: "bg-amber-50 text-amber-800", normal: "bg-emerald-50 text-emerald-800" };
const expiryLabel: Record<InventoryExpiryStatus, string> = { unknown: "Belum dicatat", expired: "Kedaluwarsa", expiring_soon: "Segera Kedaluwarsa", safe: "Aman" };
const expiryClass: Record<InventoryExpiryStatus, string> = { unknown: "bg-gray-100 text-gray-700", expired: "bg-red-50 text-red-700", expiring_soon: "bg-amber-50 text-amber-800", safe: "bg-emerald-50 text-emerald-800" };
const formatDate = (value: string | null) => value === null ? "Belum dicatat" : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00+07:00`));

export default async function InventoryDetailPage({ params, searchParams }: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ movementPage?: string; stockAdded?: string; movementType?: string; startDate?: string; endDate?: string }>;
}) {
  const employee = await requireRole(["owner_admin"]);
  const { productId: rawProductId } = await params;
  let productId: string;
  try { productId = requireUuid(rawProductId, "productId"); } catch { notFound(); }
  const canViewSensitivePricing = canViewSensitiveProductPricing(employee.role);
  const product = await getInventoryProductDetail(productId, canViewSensitivePricing);
  if (!product) notFound();

  const query = await searchParams;
  const movementFilters = parseStockMovementFilters(query);
  const movementPage = query.movementPage && /^\d+$/.test(query.movementPage) ? Math.max(1, Math.min(Number(query.movementPage), 10000)) : 1;
  let movementHistory: { rows: StockMovementRow[]; total: number; page: number; limit: number; error: boolean } | undefined;
  try {
    const result = await listProductStockMovements(productId, movementPage, 10, movementFilters);
    movementHistory = { ...result, page: movementPage, limit: 10, error: false };
  } catch (error) {
    if (!isAuthApplicationError(error)) movementHistory = { rows: [], total: 0, page: movementPage, limit: 10, error: true };
  }
  const activeBatches = product.batches.filter(batch => batch.quantity > 0 && batch.expiryStatus !== "expired").length;

  return <Container size="xl" className="space-y-7">
    <Link href="/inventory" className="inline-flex min-h-12 items-center text-base font-semibold text-brand-600 hover:underline">← Kembali ke Manajemen Stok</Link>
    {query.stockAdded === "1" ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800">Stok berhasil ditambahkan.</p> : null}
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-7"><div className="min-w-0"><h1 className="break-words text-3xl font-semibold text-gray-900 sm:text-4xl">{product.name}</h1><p className="mt-2 break-all text-lg text-gray-600">SKU: {product.sku} · Detail Persediaan</p><Link href={`/products/${product.id}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-600 hover:underline">Lihat Informasi Barang</Link></div>{employee.role === "owner_admin" ? <Link href={`/inventory/receive?product_id=${product.id}`} className={productPrimaryLinkClass}>Tambah Stok</Link> : null}</header>

    <Card className="border-2 border-brand-100"><CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-base text-gray-600">Stok tersedia</p><p className="mt-2 text-4xl font-bold text-gray-900 tabular">{product.availableStock.toLocaleString("id-ID")} <span className="text-xl font-semibold">{product.baseUnit}</span></p><span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${stockClass[product.stockStatus]}`}>{stockLabel[product.stockStatus]}</span></div><div><p className="text-base text-gray-600">Minimum stok</p><p className="mt-2 text-2xl font-semibold tabular">{product.minimumStock.toLocaleString("id-ID")} {product.baseUnit}</p></div><div><p className="text-base text-gray-600">Kedaluwarsa terdekat</p><p className="mt-2 text-2xl font-semibold">{product.nearestExpiry ? formatDate(product.nearestExpiry) : "Belum ada"}</p></div><div><p className="text-base text-gray-600">Batch aktif</p><p className="mt-2 text-2xl font-semibold tabular">{activeBatches.toLocaleString("id-ID")} batch</p></div></CardContent></Card>

    <Card><CardHeader><h2 className="text-xl font-semibold text-gray-900">Rincian Batch &amp; Kedaluwarsa</h2><p className="mt-2 text-base text-gray-600">Diurutkan dari kedaluwarsa terdekat; batch tanpa tanggal berada terakhir. Segera kedaluwarsa berarti dalam {EXPIRING_SOON_DAYS} hari.</p></CardHeader>{!product.batches.length ? <CardContent><p className="text-base text-gray-600">Belum ada batch untuk barang ini.</p></CardContent> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-base"><thead className="border-b border-gray-200 bg-gray-50"><tr><th className="px-6 py-4">Nomor Batch</th><th className="px-6 py-4">Jumlah</th><th className="px-6 py-4">Tanggal Diterima</th><th className="px-6 py-4">Kedaluwarsa</th><th className="px-6 py-4">Status</th>{canViewSensitivePricing ? <th className="px-6 py-4">Harga Modal</th> : null}</tr></thead><tbody className="divide-y divide-gray-200">{product.batches.map(batch => <tr key={batch.id}><td className="px-6 py-5 font-semibold">{batch.batchNumber ?? "Tanpa nomor batch"}</td><td className="px-6 py-5 tabular">{batch.quantity.toLocaleString("id-ID")} {product.baseUnit}</td><td className="px-6 py-5 whitespace-nowrap">{formatDate(batch.receivedDate)}</td><td className="px-6 py-5 whitespace-nowrap">{formatDate(batch.expiredDate)}</td><td className="px-6 py-5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${expiryClass[batch.expiryStatus]}`}>{expiryLabel[batch.expiryStatus]}</span></td>{canViewSensitivePricing ? <td className="px-6 py-5 tabular">{batch.costPrice === undefined ? "—" : formatRupiah(batch.costPrice)}</td> : null}</tr>)}</tbody></table></div><div className="grid gap-4 p-5 md:hidden">{product.batches.map(batch => <article key={batch.id} className="rounded-xl border border-gray-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words text-lg font-semibold">Batch {batch.batchNumber ?? "tanpa nomor"}</h3><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${expiryClass[batch.expiryStatus]}`}>{expiryLabel[batch.expiryStatus]}</span></div><dl className="mt-5 grid grid-cols-2 gap-5 text-base"><div><dt className="text-gray-600">Jumlah</dt><dd className="mt-1 font-semibold tabular">{batch.quantity.toLocaleString("id-ID")} {product.baseUnit}</dd></div><div><dt className="text-gray-600">Kedaluwarsa</dt><dd className="mt-1 font-semibold">{formatDate(batch.expiredDate)}</dd></div><div><dt className="text-gray-600">Diterima</dt><dd className="mt-1">{formatDate(batch.receivedDate)}</dd></div>{canViewSensitivePricing ? <div><dt className="text-gray-600">Harga modal</dt><dd className="mt-1 tabular">{batch.costPrice === undefined ? "—" : formatRupiah(batch.costPrice)}</dd></div> : null}</dl></article>)}</div></>}</Card>

    {movementHistory ? <StockMovementHistory productId={product.id} history={movementHistory} filters={movementFilters}/> : null}
  </Container>;
}
