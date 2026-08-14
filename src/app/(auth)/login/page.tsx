import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/modules/auth/application/auth-service";
import { loginAction } from "@/modules/auth/actions";

const messages: Record<string,string> = {
  INVALID_CREDENTIALS:"Email atau kata sandi tidak valid.",
  EMPLOYEE_NOT_FOUND:"Akun belum terhubung ke data pegawai.",
  EMPLOYEE_INACTIVE:"Akun pegawai tidak aktif.",
  UNAUTHENTICATED:"Silakan masuk untuk melanjutkan.",
  FORBIDDEN:"Akun tidak memiliki akses ke halaman tersebut.",
};

export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const employee=await getCurrentEmployee().catch(()=>null);
  if(employee) redirect("/dashboard");
  const {error}=await searchParams;
  return <main className="grid min-h-screen place-items-center p-6">
    <form action={loginAction} className="grid w-full max-w-sm gap-4 rounded border p-6">
      <div><h1 className="text-xl font-semibold">Masuk Pharmacy POS</h1><p className="text-sm text-gray-600">Gunakan akun pegawai yang telah disediakan.</p></div>
      {error ? <p role="alert" className="text-sm text-red-700">{messages[error] ?? messages.UNAUTHENTICATED}</p> : null}
      <label className="grid gap-1 text-sm">Email<input required name="email" type="email" autoComplete="email" className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Kata sandi<input required name="password" type="password" autoComplete="current-password" className="rounded border px-3 py-2" /></label>
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">Masuk</button>
    </form>
  </main>;
}
