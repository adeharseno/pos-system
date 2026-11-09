"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/modules/ui/components";

export interface DeleteInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  canDelete: boolean;
  reason?: string;
  onSuccess?: () => void;
}

export function DeleteInvoiceDialog({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  supplierName,
  canDelete,
  reason,
  onSuccess,
}: DeleteInvoiceDialogProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const close = () => {
    if (!busy) {
      setError(null);
      onClose();
    }
  };

  async function handleDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/purchase-invoices/${invoiceId}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
      });

      const body = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !body.ok) {
        setError(body.error?.message ?? "Gagal menghapus invoice. Coba kembali.");
        return;
      }

      onClose();
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat menghapus invoice. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <button
        type="button"
        aria-label="Tutup dialog"
        className="absolute inset-0 bg-gray-950/40"
        onClick={close}
      />
      <div className="relative z-10 w-full max-w-lg space-y-6 rounded-2xl bg-white p-6 shadow-xl">
        <div>
          <h2 id="delete-dialog-title" className="text-xl font-semibold text-gray-900">
            Hapus Invoice Pembelian
          </h2>
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <p>
              Nomor Invoice: <strong className="font-semibold text-gray-900">{invoiceNumber}</strong>
            </p>
            <p className="mt-1">
              Pemasok: <strong className="font-semibold text-gray-900">{supplierName}</strong>
            </p>
          </div>
        </div>

        {!canDelete ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
              <p className="font-semibold text-amber-950">Invoice Tidak Dapat Dihapus</p>
              <p className="mt-1 text-sm text-amber-900">
                {reason ?? "Invoice memiliki dependensi yang tidak memungkinkan penghapusan."}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={close}>
                Tutup
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-base text-gray-600">
              Apakah Anda yakin ingin menghapus invoice draft ini? Seluruh data barang draft yang belum diterima akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>

            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                Batal
              </Button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="inline-flex min-h-13 items-center justify-center rounded-lg bg-red-600 px-5 py-3 text-base font-semibold text-white shadow-theme-xs transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Menghapus..." : "Hapus Invoice"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

