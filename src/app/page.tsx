import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/modules/auth/application/auth-service";

export default async function HomePage() {
  const employee = await getCurrentEmployee().catch(() => null);
  if (employee) redirect("/dashboard");

  return (
    <main className="grid min-h-screen text-center">
      <aside className="login-pattern relative flex min-h-screen items-center justify-center overflow-hidden bg-[#161950] p-6 sm:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute size-[480px] rounded-full bg-brand-500/15 blur-3xl" />
        <div className="relative z-10 flex max-w-md flex-col items-center justify-center text-center">
          <div className="mx-auto mb-8 flex size-28 items-center justify-center rounded-3xl border border-white/15 bg-white p-4 shadow-theme-lg">
            <Image src="/images/logo.png" width={88} height={88} alt="Logo Apotek Cipayung Farma" className="size-full object-contain" priority />
          </div>
          <p className="mb-4 text-base font-medium text-white lg:text-lg">Apotek Cipayung Farma</p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-white lg:text-4xl">
            Pelayanan lebih baik,<br />operasional lebih mudah.
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-white/85 lg:mt-6 lg:text-base">
            Kelola penjualan, persediaan, dan aktivitas apotek dalam satu tempat.
          </p>
          <Link
            className="mt-10 inline-block rounded-lg px-4 py-2 font-medium text-white underline underline-offset-4 transition-colors hover:text-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300"
            href="/login"
          >
            Masuk sebagai pegawai
          </Link>
        </div>
      </aside>
    </main>
  );
}
