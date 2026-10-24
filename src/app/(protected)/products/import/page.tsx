import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { ProductImportPreview } from "@/modules/catalog/components/product-import-preview";
import { getProductCreateMasterData } from "@/modules/catalog/data/admin-product-queries";

export default async function ProductImportPage() {
  try {
    await requireRole(["owner_admin"]);
  } catch {
    redirect("/products");
  }

  const master = await getProductCreateMasterData();

  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <h1 className="text-2xl font-bold">Import Produk</h1>
    <p className="mt-1 text-sm text-[var(--text-muted)]">Upload file untuk memeriksa data sebelum proses import dilakukan.</p>
    <ProductImportPreview master={master} />
  </main>;
}
