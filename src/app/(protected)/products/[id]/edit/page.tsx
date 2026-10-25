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
  return <Container size="lg"><h1 className="text-2xl font-bold">Ubah Produk</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Perbarui informasi produk tanpa mengubah unit dasar atau persediaan.</p><EditProductForm id={productId} product={product} master={master} /></Container>;
}
