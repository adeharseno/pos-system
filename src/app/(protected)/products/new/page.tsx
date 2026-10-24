import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { ProductCreateForm } from "@/modules/catalog/components/product-create-form";
import { getProductCreateMasterData } from "@/modules/catalog/data/admin-product-queries";
import { Card, CardContent, Container } from "@/modules/ui/components";

export default async function NewProductPage() {
  try {
    await requireRole(["owner_admin"]);
  } catch {
    redirect("/products");
  }

  const data = await getProductCreateMasterData();

  return (
    <Container size="lg">
      <h1 className="text-2xl font-bold">Tambah Produk</h1>
      <p className="mb-5 mt-1 text-sm text-[var(--text-muted)]">
        Buat produk beserta satu unit penjualan dasar.
      </p>
      {data.categories.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-[var(--text-muted)]">Belum ada kategori yang tersedia.</p>
          </CardContent>
        </Card>
      ) : (
        <ProductCreateForm {...data} />
      )}
    </Container>
  );
}
