import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { DeactivateProductButton } from "@/modules/catalog/components/deactivate-product-button";
import { ProductDetailSections } from "@/modules/catalog/components/product-detail-sections";
import { ProductStatus, productLinkClass } from "@/modules/catalog/components/product-presentation";
import { getAdminProduct } from "@/modules/catalog/data/admin-product-queries";
import { canViewSensitiveProductPricing } from "@/modules/catalog/product-pricing-access";
import { requireUuid } from "@/modules/shared/validation/input";
import { Card, CardContent, Container } from "@/modules/ui/components";

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
    <Link href="/products" className={productLinkClass}>Kembali ke Daftar Barang</Link>
    <header className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><h1 className="min-w-0 flex-1 break-words text-2xl font-semibold text-gray-900">{product.name}</h1><ProductStatus active={product.isActive} /></div>
      {owner ? <div className="flex flex-wrap items-start gap-3"><Link href={`/products/${product.id}/edit`} className={productLinkClass}>Ubah Barang</Link>{product.isActive ? <><Link href={`/inventory/receive?product_id=${product.id}`} className={productLinkClass}>Stok Masuk</Link><DeactivateProductButton productId={product.id} /></> : null}</div> : null}
    </header>
    <ProductDetailSections product={product} owner={owner} canViewSensitivePricing={canViewSensitivePricing} />
  </Container>;
}
