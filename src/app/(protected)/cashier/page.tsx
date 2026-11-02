import { redirect } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { CashierWorkspace } from "@/modules/sales/components/cashier-workspace";

export default async function CashierPage() {
  let employee;
  try { employee = await requirePosOperator(); }
  catch (error) { redirect(`/login?error=${isAuthApplicationError(error) ? error.code : "FORBIDDEN"}`); }
  return <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden p-3 sm:p-4 lg:p-5"><header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--accent)]">Operasional</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Kasir</h1></div><p className="text-xs text-[var(--text-muted)]">{employee.name}</p></header><CashierWorkspace /></main>;
}
