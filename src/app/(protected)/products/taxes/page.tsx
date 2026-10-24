import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { TaxManagement } from "@/modules/catalog/components/tax-management";
import { listTaxRates } from "@/modules/catalog/data/tax-rate-repository";
import { Container } from "@/modules/ui/components";

export default async function TaxesPage() { try { await requireRole(["owner_admin"]); } catch { redirect("/products"); } const taxes = await listTaxRates(); return <Container size="lg"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Pajak</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Kelola tarif pajak yang tersedia untuk produk.</p></div><Link href="/products" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Produk</Link></header><TaxManagement taxes={taxes} /></Container>; }
