import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { CategoryManagement } from "@/modules/catalog/components/category-management";
import { listCategoriesForManagement } from "@/modules/catalog/data/admin-product-queries";
import { Container } from "@/modules/ui/components";

export default async function CategoriesPage() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const data = await listCategoriesForManagement();
  return <Container size="lg"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Kategori</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Kelola kategori barang.</p></div><nav className="flex flex-wrap gap-2"><Link href="/products" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Produk</Link><Link href="/products/subcategories" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Subkategori</Link></nav></header><CategoryManagement {...data} /></Container>;
}
