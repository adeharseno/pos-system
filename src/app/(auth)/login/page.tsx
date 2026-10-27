import Image from "next/image";
import { redirect } from "next/navigation";

import { getCurrentEmployee } from "@/modules/auth/application/auth-service";
import { loginAction } from "@/modules/auth/actions";
import { Button, FormField, Input, Label } from "@/modules/ui/components";

const messages: Record<string,string> = {
  INVALID_CREDENTIALS:"Email atau kata sandi tidak valid.",
  EMPLOYEE_NOT_FOUND:"Akun belum terhubung ke data pegawai.",
  EMPLOYEE_INACTIVE:"Akun pegawai tidak aktif.",
  UNAUTHENTICATED:"Silakan masuk untuk melanjutkan.",
  FORBIDDEN:"Akun tidak memiliki akses ke halaman tersebut.",
};

// Layout adapted from TailAdmin SignInForm and auth layout; existing auth is retained.
export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const employee=await getCurrentEmployee().catch(()=>null);
  if(employee) redirect("/dashboard");
  const {error}=await searchParams;
  return <main className="grid min-h-dvh bg-white lg:grid-cols-2">
    <section className="flex min-h-dvh flex-col px-6 py-8 sm:px-12 lg:px-16">
      <div className="flex items-center gap-3">
        <Image src="/images/logo.png" width={56} height={56} alt="Logo Cipayung Farma" priority className="h-14 w-14 object-contain" />
        <p className="text-lg font-semibold text-gray-800">Apotek Cipayung Farma</p>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <div className="mb-8"><h1 className="mb-2 text-3xl font-semibold tracking-tight text-gray-800 sm:text-4xl">Masuk ke akun Anda</h1><p className="text-sm leading-6 text-gray-500">Gunakan akun pegawai Anda.</p></div>
        <form action={loginAction} className="grid gap-6">
          {error ? <p id="login-error" role="alert" className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{messages[error] ?? messages.UNAUTHENTICATED}</p> : null}
          <FormField><Label htmlFor="email">Email <span className="text-[var(--danger)]">*</span></Label><Input id="email" required name="email" type="email" autoComplete="email" placeholder="Masukkan email Anda" aria-describedby={error ? "login-error" : undefined} /></FormField>
          <FormField><Label htmlFor="password">Kata sandi <span className="text-[var(--danger)]">*</span></Label><Input id="password" required name="password" type="password" autoComplete="current-password" placeholder="Masukkan kata sandi Anda" aria-describedby={error ? "login-error" : undefined} /></FormField>
          <Button type="submit" className="w-full">Masuk</Button>
        </form>
        <p className="mt-6 text-sm leading-6 text-gray-500">Butuh bantuan akses? Hubungi pengelola apotek.</p>
      </div>
      <p className="text-xs text-gray-400">Cipayung Farma · Pharmacy POS</p>
    </section>
    <aside className="login-pattern relative hidden items-center justify-center overflow-hidden bg-[#161950] p-12 lg:flex">
      <div aria-hidden="true" className="absolute size-[480px] rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative max-w-md text-center">
        <div className="mx-auto mb-8 flex size-28 items-center justify-center rounded-3xl border border-white/15 bg-white p-4 shadow-theme-lg"><Image src="/images/logo.png" width={88} height={88} alt="" className="size-full object-contain" /></div>
        <p className="mb-4 text-lg font-medium text-white">Apotek Cipayung Farma</p>
        <h2 className="text-4xl leading-tight font-semibold tracking-tight text-white">Pelayanan lebih baik,<br />operasional lebih mudah.</h2>
        <p className="mx-auto mt-6 max-w-sm text-base leading-7 text-white/85">Kelola penjualan, persediaan, dan aktivitas apotek dalam satu tempat.</p>
      </div>
    </aside>
  </main>;
}
