import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="grid min-h-screen gap-2 text-center">
      <aside className="login-pattern relative items-center justify-center overflow-hidden bg-[#161950] p-12 lg:flex">
        <div aria-hidden="true" className="absolute size-[480px] rounded-full bg-brand-500/15 blur-3xl" />
        <div className="max-w-md flex text-center items-center h-full">
          <div>
            <div className="mx-auto mb-8 flex size-28 items-center justify-center rounded-3xl border border-white/15 bg-white p-4 shadow-theme-lg"><Image src="/images/logo.png" width={88} height={88} alt="" className="size-full object-contain" /></div>
            <p className="mb-4 text-md lg:text-lg font-medium text-white">Apotek Cipayung Farma</p>
            <h2 className="text-2xl lg:text-4xl leading-tight font-semibold tracking-tight text-white">Pelayanan lebih baik,<br />operasional lebih mudah.</h2>
            <p className="mx-auto mt-3 lg:mt-6 max-w-sm text-sm lg:text-base leading-7 text-white/85">Kelola penjualan, persediaan, dan aktivitas apotek dalam satu tempat.</p>
            <Link className="underline text-white mt-10 inline-block" href="/login">Masuk sebagai pegawai</Link>
          </div>
        </div>
      </aside>
    </main>
  );
}
