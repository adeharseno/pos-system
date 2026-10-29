import Link from "next/link";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { EditProductForm } from "@/modules/catalog/components/edit-product-form";
import { getAdminProduct, getProductCreateMasterData } from "@/modules/catalog/data/admin-product-queries";
import { requireUuid } from "@/modules/shared/validation/input";
import { Container } from "@/modules/ui/components";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  let productId: string;
  try { productId = requireUuid(id, "productId"); } catch { notFound(); }
  const product = await getAdminProduct(productId, true);
  if (!product) notFound();
  const master = await getProductCreateMasterData();
  return <Container size="lg"><h1 className="text-2xl font-bold">Ubah Produk</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Perbarui informasi produk tanpa mengubah unit dasar atau persediaan.</p><div className="mt-5 space-y-3"><h2 className="text-lg font-semibold">Harga Jual</h2>{product.units.length ? <div className="flex flex-wrap gap-3">{product.units.map(unit => <Link key={unit.id} className={productLinkClass} href={`/products/${productId}/units/${unit.id}/edit`}>Ubah Harga Jual: {unit.unit_name}</Link>)}</div> : <><p className="text-base text-gray-600">Harga jual belum diatur. Tambahkan satuan dengan harga yang valid sebelum produk dapat dijual.</p><Link className={productLinkClass} href={`/products/${productId}/units/new`}>Atur Harga Jual</Link></>}</div><EditProductForm id={productId} product={product} master={master} /></Container>;
}
