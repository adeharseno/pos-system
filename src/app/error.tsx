"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Terjadi kesalahan. Silakan coba lagi.</h1>
      <button className="mt-4 underline" onClick={reset} type="button">
        Coba lagi
      </button>
    </main>
  );
}
