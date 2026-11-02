import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { CategoryManagement } from "@/modules/catalog/components/category-management";
import { listCategoriesForManagement } from "@/modules/catalog/data/admin-product-queries";
import { CATEGORY_LABEL } from "@/modules/catalog/master-data-labels";
import { Container } from "@/modules/ui/components";

export default async function CategoriesPage() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const data = await listCategoriesForManagement();
  return <Container size="lg"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{CATEGORY_LABEL}</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Kelola {CATEGORY_LABEL.toLowerCase()} barang.</p></div><Link href="/products" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Kembali</Link></header><CategoryManagement categories={data.categories} /></Container>;
}
