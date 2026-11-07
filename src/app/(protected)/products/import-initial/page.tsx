import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { InitialProductImport } from "@/modules/catalog/components/initial-product-import";
import { isProductCatalogEmpty } from "@/modules/catalog/data/admin-product-queries";
import { Container } from "@/modules/ui/components";

export default async function InitialProductImportPage() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  if (!(await isProductCatalogEmpty())) redirect("/products");
  return <Container size="xl"><h1 className="text-2xl font-semibold">Impor Data Awal</h1><p className="mt-2 text-gray-600">Impor master barang, harga, pemasok, dan stok awal dalam satu proses.</p><InitialProductImport/></Container>;
}
