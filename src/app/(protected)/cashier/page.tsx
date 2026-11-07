import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { requireAllPermissions } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { CashierWorkspace } from "@/modules/sales/components/cashier-workspace";
import { HomeIcon, UsersIcon } from "@/modules/ui/icons";

export default async function CashierPage() {
  let employee;
  try { employee = await requireAllPermissions(["cashier.view", "sales.checkout"]); }
  catch (error) { redirect(`/login?error=${isAuthApplicationError(error) ? error.code : "FORBIDDEN"}`); }
  return <main data-cashier-restricted={employee.role === "kasir" ? "true" : undefined} className="flex min-h-0 w-full flex-1 flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
    <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Image src="/images/logo.png" width={48} height={48} alt="Logo Apotek Cipayung Farma" className="size-12 shrink-0 object-contain sm:size-14" priority />
        <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--accent)]">Operasional</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Kasir</h1></div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 text-sm font-medium text-gray-700"><UsersIcon className="size-5 shrink-0 text-[var(--accent)]" /><span className="max-w-40 truncate sm:max-w-56">{employee.name}</span></div>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"><HomeIcon className="size-5" /><span>Kembali ke Beranda</span></Link>
      </div>
    </header>
    <CashierWorkspace />
  </main>;
}
