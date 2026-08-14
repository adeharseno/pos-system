import { logoutAction } from "@/modules/auth/actions";
import { requireEmployee } from "@/modules/auth/application/auth-service";

export default async function DashboardPage() {
  const employee=await requireEmployee();
  return <main className="grid min-h-screen place-content-center gap-4 p-6 text-center">
    <div><h1 className="text-2xl font-semibold">Pharmacy POS</h1><p>Masuk sebagai {employee.name} ({employee.role})</p></div>
    <p className="text-sm text-gray-600">Fondasi sesi pegawai aktif. Fitur operasional belum dibangun.</p>
    <form action={logoutAction}><button className="rounded border px-4 py-2" type="submit">Keluar</button></form>
  </main>;
}
