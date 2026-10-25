import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { canViewSensitiveProductPricing } from "@/modules/catalog/product-pricing-access";
import { getInventoryProductDetail } from "@/modules/inventory/data/inventory-detail-queries";
import { EXPIRING_SOON_DAYS, type InventoryExpiryStatus, type InventoryStockStatus } from "@/modules/inventory/inventory-rules";
import { requireUuid } from "@/modules/shared/validation/input";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Container } from "@/modules/ui/components";

const stockLabel: Record<InventoryStockStatus, string> = { out: "Habis", low: "Stok Menipis", safe: "Aman" };
const stockClass: Record<InventoryStockStatus, string> = { out: "bg-[var(--danger-soft)] text-[var(--danger)]", low: "bg-amber-100 text-amber-800", safe: "bg-emerald-100 text-emerald-800" };
const expiryLabel: Record<InventoryExpiryStatus, string> = { expired: "Kedaluwarsa", expiring_soon: "Segera Kedaluwarsa", safe: "Aman" };
const expiryClass: Record<InventoryExpiryStatus, string> = { expired: "bg-[var(--danger-soft)] text-[var(--danger)]", expiring_soon: "bg-amber-100 text-amber-800", safe: "bg-emerald-100 text-emerald-800" };

export default async function InventoryDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const employee = await requirePosOperator();
  const { productId: rawProductId } = await params;
  let productId: string;
  try { productId = requireUuid(rawProductId, "productId"); } catch { notFound(); }
  const canViewSensitivePricing = canViewSensitiveProductPricing(employee.role);
  const product = await getInventoryProductDetail(productId, canViewSensitivePricing);
  if (!product) notFound();

  return <Container size="xl">
    <Link href="/inventory" className="text-sm font-semibold underline">← Kembali ke Persediaan</Link>
    <header className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{product.name}</h1><p className="mt-1 text-sm text-[var(--text-muted)]">{product.sku}</p></div>{employee.role === "owner_admin" ? <Link href={`/inventory/receive?product_id=${product.id}`} className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">Terima Stok</Link> : null}</header>
    <Card><CardHeader><h2 className="font-semibold">Ringkasan Produk</h2></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-[var(--text-muted)]">Kategori / Subkategori</dt><dd className="mt-1">{product.category} · {product.subcategory}</dd></div><div><dt className="text-[var(--text-muted)]">Unit Dasar</dt><dd className="mt-1">{product.baseUnit}</dd></div><div><dt className="text-[var(--text-muted)]">Stok Tersedia</dt><dd className="mt-1">{product.availableStock} {product.baseUnit}</dd></div><div><dt className="text-[var(--text-muted)]">Minimum Stok</dt><dd className="mt-1">{product.minimumStock}</dd></div><div><dt className="text-[var(--text-muted)]">Status Stok</dt><dd className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stockClass[product.stockStatus]}`}>{stockLabel[product.stockStatus]}</span></dd></div><div><dt className="text-[var(--text-muted)]">Kedaluwarsa Terdekat</dt><dd className="mt-1">{product.nearestExpiry ?? "—"}</dd></div></dl></CardContent></Card>
    <Card className="mt-5"><CardHeader><h2 className="font-semibold">Batch</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Diurutkan dari tanggal kedaluwarsa terdekat. Segera kedaluwarsa berarti dalam {EXPIRING_SOON_DAYS} hari.</p></CardHeader><CardContent className="p-0">{product.batches.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Belum ada batch untuk produk ini.</p> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nomor Batch</th><th className="p-4">Jumlah</th>{canViewSensitivePricing ? <th className="p-4">Harga Modal</th> : null}<th className="p-4">Tanggal Diterima</th><th className="p-4">Tanggal Kedaluwarsa</th><th className="p-4">Status Kedaluwarsa</th></tr></thead><tbody>{product.batches.map((batch) => <tr key={batch.id} className="border-t border-[var(--border)]"><td className="p-4 font-medium">{batch.batchNumber}</td><td className="p-4">{batch.quantity} {product.baseUnit}</td>{canViewSensitivePricing ? <td className="p-4">{batch.costPrice === undefined ? "—" : formatRupiah(batch.costPrice)}</td> : null}<td className="p-4">{batch.receivedDate}</td><td className="p-4">{batch.expiredDate}</td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${expiryClass[batch.expiryStatus]}`}>{expiryLabel[batch.expiryStatus]}</span></td></tr>)}</tbody></table></div><div className="grid gap-3 p-5 md:hidden">{product.batches.map((batch) => <Card key={batch.id}><CardContent><div className="flex items-start justify-between gap-3"><strong>{batch.batchNumber}</strong><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${expiryClass[batch.expiryStatus]}`}>{expiryLabel[batch.expiryStatus]}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">Jumlah</dt><dd>{batch.quantity} {product.baseUnit}</dd></div>{canViewSensitivePricing ? <div><dt className="text-[var(--text-muted)]">Harga Modal</dt><dd>{batch.costPrice === undefined ? "—" : formatRupiah(batch.costPrice)}</dd></div> : null}<div><dt className="text-[var(--text-muted)]">Tanggal Diterima</dt><dd>{batch.receivedDate}</dd></div><div><dt className="text-[var(--text-muted)]">Tanggal Kedaluwarsa</dt><dd>{batch.expiredDate}</dd></div></dl></CardContent></Card>)}</div></>}</CardContent></Card>
  </Container>;
}
