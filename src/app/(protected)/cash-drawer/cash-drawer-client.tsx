"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/modules/ui/currency";
import { Card, CardContent, CardHeader, Button, FormError } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
import { RupiahInput } from "@/modules/ui/rupiah-input";

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
  const closeFormId = useId();
  const [actualCash, setActualCash] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasActual = actualCash !== null;

  const handleCloseRequest = () => {
    if (!hasActual) {
      setError("Saldo Kas Akhir harus diisi.");
      return;
    }
    setError("");
    setConfirmOpen(true);
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
              <span className="text-[var(--text-muted)]">Saldo Kas Awal</span>
              <span className="font-semibold">{formatRupiah(drawer.opening_balance)}</span>
            </div>
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

            <div className="grid gap-4">
              <div className="grid gap-2">
                <label
                  htmlFor="actual_closing_cash_display"
                  className="text-base font-medium text-gray-700"
                >
                  Saldo Kas Akhir
                </label>
                <RupiahInput
                  id="actual_closing_cash_display"
                  value={actualCash}
                  error={Boolean(error)}
                  aria-describedby={error ? "actual_closing_cash-error" : undefined}
                  onValueChange={(value) => {
                    setActualCash(value);
                    if (value !== null) setError("");
                  }}
                />
                <FormError id="actual_closing_cash-error">{error}</FormError>
              </div>

              <form id={closeFormId} action={closeCashDrawerAction}>
                <input type="hidden" name="session_id" value={drawer.id} />
                <input
                  type="hidden"
                  name="actual_closing_cash"
                  value={actualCash ?? 0}
                />
                <Button
                  type="button"
                  variant="danger"
                  className="w-full"
                  onClick={handleCloseRequest}
                >
                  Tutup Sesi Kasir
                </Button>
              </form>
            </div>
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
            Anda akan menutup sesi kasir dengan Saldo Kas Akhir:{" "}
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
          <Button type="submit" form={closeFormId} variant="danger">
            Ya, Tutup Sesi
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

