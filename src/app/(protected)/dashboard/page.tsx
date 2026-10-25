import { logoutAction } from "@/modules/auth/actions";
import { requireEmployee } from "@/modules/auth/application/auth-service";
import Link from "next/link";

export default async function DashboardPage() {
  const employee=await requireEmployee();
  return <main className="grid min-h-screen place-content-center gap-4 p-6 text-center">
    <div><h1 className="text-2xl font-semibold">Beranda</h1><p>Masuk sebagai {employee.name} ({employee.role === "owner_admin" ? "Pemilik" : employee.role === "kasir" ? "Kasir" : "Staf"})</p></div>
    <p className="text-sm text-gray-600">Pilih kegiatan yang ingin dilakukan.</p>
    <Link className="underline" href="/cash-drawer">Kelola sesi kasir</Link>
    <Link className="underline" href="/cashier">Buka halaman kasir</Link>
    <form action={logoutAction}><button className="rounded border px-4 py-2" type="submit">Keluar</button></form>
  </main>;
}
