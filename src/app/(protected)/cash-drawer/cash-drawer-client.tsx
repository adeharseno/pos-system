"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { formatRupiah, parseRupiahInput } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Button } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";

type Drawer = {
  id: string;
  opening_balance: number;
  opened_at: string;
};

type Props = {
  drawer: Drawer;
  closeCashDrawerAction: (formData: FormData) => Promise<never>;
};

function formatSessionTime(isoString: string): string {
  return new Date(isoString).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashDrawerPageClient({ drawer, closeCashDrawerAction }: Props) {
  const modalTitleId = useId();
  const [rawInput, setRawInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Parse current input as a number (null = empty/invalid)
  const actualCash = parseRupiahInput(rawInput);

  // Format display while typing — show formatted value only when non-empty
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    setRawInput(digits);
  };

  const displayValue = rawInput
    ? Number(rawInput).toLocaleString("id-ID")
    : "";

  // Difference: actualCash - expectedCash. We only know expectedCash after close RPC.
  // Show "Selisih belum diketahui" until user enters a value; we can show a rough
  // estimate based on opening_balance since we don't have sales data client-side.
  // Per requirements: "perkiraan kas tunai berdasarkan perhitungan existing" comes from
  // the RPC on close. We show the opening balance as the minimum reference instead.
  const hasActual = actualCash !== null;

  const handleCloseRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasActual) return;
    setConfirmOpen(true);
  };

  const handleConfirmedClose = () => {
    setConfirmOpen(false);
    // Submit the hidden form
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <Card>
        {/* Session status header */}
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-emerald-500" />
                <h2 className="text-base font-semibold text-[var(--success)]">
                  Sesi Kasir Aktif
                </h2>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Mulai: {formatSessionTime(drawer.opened_at)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Summary row */}
          <div className="grid gap-2 rounded-xl bg-[var(--surface-subtle)] p-4">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">Modal awal</span>
              <span className="font-semibold">{formatRupiah(drawer.opening_balance)}</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Perkiraan kas tunai akhir akan dihitung otomatis saat sesi ditutup
              (modal awal + penjualan tunai − retur tunai).
            </p>
          </div>

          {/* Go to cashier */}
          <Link
            href="/cashier"
            className="flex min-h-13 items-center justify-center rounded-xl bg-zinc-950 px-4 text-base font-semibold text-white hover:bg-zinc-800"
          >
            Buka Halaman Kasir
          </Link>

          {/* Close session form */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-base font-semibold text-gray-800">
              Tutup Sesi Kasir
            </h3>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Hitung uang tunai yang ada di laci kasir sekarang, lalu masukkan jumlahnya.
            </p>

            <form onSubmit={handleCloseRequest} className="grid gap-4">
              <div className="grid gap-2">
                <label
                  htmlFor="actual_closing_cash_display"
                  className="text-base font-medium text-gray-700"
                >
                  Uang Tunai di Laci Saat Ini (Rp)
                </label>
                <input
                  id="actual_closing_cash_display"
                  type="text"
                  inputMode="numeric"
                  value={displayValue}
                  onChange={handleChange}
                  placeholder="Contoh: 1.500.000"
                  className="min-h-13 w-full rounded-xl border border-[var(--border-strong)] bg-white px-4 py-3 text-base text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20"
                />
                {hasActual && (
                  <p className="text-sm font-medium text-gray-700">
                    = {formatRupiah(actualCash!)}
                  </p>
                )}
              </div>

              {/* Difference note */}
              {hasActual && (
                <div className="flex justify-between rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm">
                  <span className="text-[var(--text-muted)]">
                    Selisih dengan perkiraan akan muncul setelah sesi ditutup
                  </span>
                </div>
              )}

              <Button
                type="submit"
                variant="danger"
                disabled={!hasActual}
                className="w-full"
              >
                Tutup Sesi Kasir
              </Button>
            </form>

            {/* Hidden real form that submits the server action */}
            <form ref={formRef} action={closeCashDrawerAction} className="hidden">
              <input type="hidden" name="session_id" value={drawer.id} />
              <input
                type="hidden"
                name="actual_closing_cash"
                value={actualCash ?? 0}
              />
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Confirm close modal */}
      <Modal open={confirmOpen} labelledBy={modalTitleId} onClose={() => setConfirmOpen(false)}>
        <ModalHeader id={modalTitleId} onClose={() => setConfirmOpen(false)}>
          Tutup Sesi Kasir?
        </ModalHeader>
        <ModalContent>
          <p className="text-base text-gray-700">
            Anda akan menutup sesi kasir dengan uang tunai di laci:{" "}
            <strong>{hasActual ? formatRupiah(actualCash!) : "–"}</strong>.
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Setelah ditutup, sesi tidak dapat dibuka kembali. Pastikan jumlahnya sudah benar.
          </p>
        </ModalContent>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirmedClose}>
            Ya, Tutup Sesi
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

