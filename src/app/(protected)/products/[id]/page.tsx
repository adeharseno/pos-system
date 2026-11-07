import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { DeactivateProductButton } from "@/modules/catalog/components/deactivate-product-button";
import { ProductDetailSections } from "@/modules/catalog/components/product-detail-sections";
import { ProductStatus, StockStatus, productLinkClass } from "@/modules/catalog/components/product-presentation";
import { getAdminProduct } from "@/modules/catalog/data/admin-product-queries";
import { canViewSensitiveProductPricing } from "@/modules/catalog/product-pricing-access";
import { requireUuid } from "@/modules/shared/validation/input";
import { Card, CardContent, Container } from "@/modules/ui/components";
import { ProductDetailBackButton } from "@/modules/catalog/components/product-detail-back-button";
import { ConfirmInitialUnit } from "@/modules/catalog/components/confirm-initial-unit";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requirePosOperator();
  const { id } = await params;
  let productId: string;
  try { productId = requireUuid(id, "productId"); } catch { notFound(); }
  const canViewSensitivePricing = canViewSensitiveProductPricing(employee.role);
  let product: Awaited<ReturnType<typeof getAdminProduct>>;
  try { product = await getAdminProduct(productId, canViewSensitivePricing); }
  catch {
    return <Container size="xl" className="space-y-7"><Link href="/products" className={productLinkClass}>Kembali ke Daftar Barang</Link><Card><CardContent className="space-y-5"><h1 className="text-xl font-semibold text-gray-900">Barang belum dapat dimuat</h1><p role="alert" className="text-base text-gray-700">Periksa koneksi Anda, lalu coba lagi.</p><Link href={`/products/${productId}`} className={productLinkClass}>Coba Lagi</Link></CardContent></Card></Container>;
  }
  if (!product) notFound();
  const owner = employee.role === "owner_admin";
  return <Container size="xl" className="space-y-7">
    <ProductDetailBackButton />
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-gray-200 pb-7">
      <div className="min-w-0 flex-1"><h1 className="break-words text-3xl font-semibold text-gray-900 sm:text-4xl">{product.name}</h1><p className="mt-2 break-all text-lg text-gray-600">SKU: {product.sku}</p><div className="mt-4 flex flex-wrap gap-2"><ProductStatus active={product.isActive}/><StockStatus active={product.isActive} quantity={product.availableStock} minimum={product.minimumStock}/></div></div>
      {owner ? <div className="flex flex-wrap items-start gap-3"><Link href={`/products/${product.id}/edit`} className={productLinkClass}>Ubah Barang</Link>{product.isActive ? <DeactivateProductButton productId={product.id} /> : null}</div> : null}
    </header>
    {owner && !product.unitConfirmed ? <ConfirmInitialUnit productId={product.id} stock={product.availableStock}/> : null}
    <ProductDetailSections product={product} owner={owner} canViewSensitivePricing={canViewSensitivePricing} />
  </Container>;
}
