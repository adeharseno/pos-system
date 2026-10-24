import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { AddUnitForm } from "@/modules/catalog/components/add-unit-form";
import { getAdminProduct } from "@/modules/catalog/data/admin-product-queries";
import { requireUuid } from "@/modules/shared/validation/input";
import { Container } from "@/modules/ui/components";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  let productId: string;
  try { productId = requireUuid(id, "productId"); } catch { notFound(); }
  const product = await getAdminProduct(productId);
  if (!product) notFound();
  return <Container size="md"><Link href={`/products/${productId}`} className="text-sm font-semibold underline">← Kembali ke Produk</Link><h1 className="mt-4 text-2xl font-bold">Tambah Unit · {product.name}</h1><AddUnitForm productId={productId} /></Container>;
}
