import Link from "next/link";

export default function HomePage() {
  return (
    <main className="grid min-h-screen place-content-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Pharmacy POS Pilot 1</h1>
      <p>Aplikasi apotek siap digunakan.</p>
      <Link className="underline" href="/login">Masuk sebagai pegawai</Link>
    </main>
  );
}
