import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { listActiveProductsForReceiving } from "@/modules/catalog/data/admin-product-queries";
import { ReceiveStockForm } from "@/modules/inventory/components/receive-stock-form";
import { Container } from "@/modules/ui/components";

export default async function ReceiveStockPage({ searchParams }: { searchParams: Promise<{ product_id?: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const products = await listActiveProductsForReceiving();
  const { product_id: initialProductId } = await searchParams;
  if (initialProductId && !products.some((product) => product.id === initialProductId)) notFound();
  return <Container size="lg"><header><h1 className="text-2xl font-bold">Terima Stok</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Penerimaan stok membuat batch baru dan tidak mengubah harga modal produk master.</p></header><ReceiveStockForm products={products} initialProductId={initialProductId}/></Container>;
}
