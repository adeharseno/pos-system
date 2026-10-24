import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { EditUnitForm } from "@/modules/catalog/components/edit-unit-form";
import { getAdminProduct } from "@/modules/catalog/data/admin-product-queries";
import { requireUuid } from "@/modules/shared/validation/input";
import { Container } from "@/modules/ui/components";

export default async function Page({ params }: { params: Promise<{ id: string; unitId: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id, unitId } = await params;
  let productId: string;
  try { productId = requireUuid(id, "productId"); requireUuid(unitId, "unitId"); } catch { notFound(); }
  const product = await getAdminProduct(productId, true);
  const unit = product?.units.find((value) => value.id === unitId);
  if (!product || !unit) notFound();
  return <Container size="md"><Link href={`/products/${productId}`} className="text-sm font-semibold underline">← Kembali ke Produk</Link><h1 className="mt-4 text-2xl font-bold">Edit Unit</h1><EditUnitForm productId={productId} unit={{ id: unit.id, name: unit.unit_name, conversion: unit.conversion_to_base, price: unit.selling_price, barcode: unit.barcode, base: unit.is_base_unit }} /></Container>;
}
