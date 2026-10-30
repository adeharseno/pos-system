import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { closeCashDrawerAction, openCashDrawerAction } from "@/modules/cash-drawer/actions";
import { getCurrentCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader } from "@/modules/ui/components";
import { CashDrawerPageClient } from "./cash-drawer-client";

const ERROR_LABELS: Record<string, string> = {
  INVALID_OPENING_BALANCE: "Jumlah modal awal tidak valid. Periksa kembali lalu coba lagi.",
  INVALID_CLOSING_BALANCE: "Jumlah kas penutupan tidak valid. Periksa kembali lalu coba lagi.",
  CASH_DRAWER_ALREADY_OPEN: "Sesi kasir sudah aktif.",
  CASH_DRAWER_ALREADY_CLOSED: "Sesi kasir sudah ditutup.",
  NO_ACTIVE_CASH_DRAWER: "Tidak ada sesi kasir yang aktif.",
};

export default async function CashDrawerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const employee = await requirePosOperator();
  const drawer = await getCurrentCashDrawer(employee.employeeId);
  const query = await searchParams;

  const employeeLabel =
    employee.role === "owner_admin" ? "Pemilik" : "Kasir";

  // After successful close: show summary
  if (query.closed) {
    const expected = Number(query.expected ?? 0);
    const actual = Number(query.actual ?? 0);
    const difference = Number(query.difference ?? 0);
    return (
      <main className="mx-auto grid min-h-screen max-w-lg content-center gap-5 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Operasional
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Sesi Kasir</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {employee.name} · {employeeLabel}
          </p>
        </div>
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--success)]">
              ✓ Sesi kasir berhasil ditutup
            </h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 rounded-xl bg-[var(--surface-subtle)] p-4">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Perkiraan kas tunai</span>
                <span className="font-semibold">{formatRupiah(expected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Kas aktual (hitung manual)</span>
                <span className="font-semibold">{formatRupiah(actual)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-2 text-sm font-semibold">
                <span>Selisih</span>
                <span className={difference === 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                  {difference >= 0 ? "+" : ""}{formatRupiah(difference)}
                </span>
              </div>
            </div>
            <a
              href="/cash-drawer"
              className="flex min-h-13 items-center justify-center rounded-xl bg-zinc-950 px-4 text-base font-semibold text-white hover:bg-zinc-800"
            >
              Buka Sesi Baru
            </a>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-5 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          Operasional
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Sesi Kasir</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {employee.name} · {employeeLabel}
        </p>
      </div>

      {query.error ? (
        <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
          {ERROR_LABELS[query.error] ?? "Tindakan tidak dapat diselesaikan. Periksa kembali lalu coba lagi."}
        </p>
      ) : null}

      {!drawer ? (
        /* ── Form buka sesi ── */
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-[var(--text)]">Mulai Sesi Kasir</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Masukkan jumlah uang tunai yang ada di laci kasir sekarang.
            </p>
          </CardHeader>
          <CardContent>
            <form action={openCashDrawerAction} className="grid gap-4">
              <div className="grid gap-2">
                <label
                  htmlFor="opening_balance"
                  className="text-base font-medium text-gray-700"
                >
                  Modal Awal (Rp)
                </label>
                <input
                  id="opening_balance"
                  name="opening_balance"
                  type="number"
                  required
                  min="0"
                  step="1"
                  placeholder="Contoh: 500000"
                  className="min-h-13 w-full rounded-xl border border-[var(--border-strong)] bg-white px-4 py-3 text-base text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20"
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Jumlah uang tunai di laci sebelum mulai berjualan hari ini.
                </p>
              </div>
              <button
                type="submit"
                className="flex min-h-13 items-center justify-center rounded-xl bg-zinc-950 px-4 text-base font-semibold text-white hover:bg-zinc-800"
              >
                Mulai Sesi Kasir
              </button>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* ── Sesi aktif ── */
        <CashDrawerPageClient
          drawer={{
            id: drawer.id,
            opening_balance: drawer.opening_balance,
            opened_at: drawer.opened_at,
          }}
          closeCashDrawerAction={closeCashDrawerAction}
        />
      )}
    </main>
  );
}
