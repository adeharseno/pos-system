import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { ExpenseWorkspace } from "@/modules/expenses/components/expense-workspace";
import { jakartaToday } from "@/modules/reports/sales-report";
import { Container } from "@/modules/ui/components";

export default async function ExpensesPage() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/"); }
  return <Container size="xl"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Biaya Operasional</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Catat dan periksa pengeluaran operasional apotek.</p></div><Link href="/reports" className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-sm font-medium">Kembali ke Laporan</Link></header><ExpenseWorkspace today={jakartaToday()} /></Container>;
}
