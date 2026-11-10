"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRupiah } from "@/modules/ui/currency";
import { Button, Card, CardContent, Container } from "@/modules/ui/components";

export type ReturnCandidateItem = {
  id: string;
  name: string;
  unit: string;
  price: number;
  conversion: number;
  purchasedBase: number;
  returnedBase: number;
  remainingBase: number;
  purchasedUnits: number | null;
  returnedUnits: number | null;
  remainingUnits: number | null;
  exact: boolean;
};

export interface CustomerReturnRequestFormProps {
  transaction: {
    id: string;
    invoice: string;
    payment: "cash" | "qris" | "bank_transfer" | "bpjs";
    items: ReturnCandidateItem[];
  };
}

export function CustomerReturnRequestForm({ transaction }: CustomerReturnRequestFormProps) {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    returnId: string;
    refundTotal: number;
  } | null>(null);

  const availableItems = transaction.items.filter((item) => item.remainingBase > 0);
  const allCompleted = transaction.items.every((item) => item.remainingBase === 0);

  const toggleSelect = (id: string, maxQty: number) => {
    setSelectedIds((prev) => {
      const next = !prev[id];
      if (next && (!quantities[id] || quantities[id] <= 0)) {
        setQuantities((q) => ({ ...q, [id]: 1 }));
      }
      return { ...prev, [id]: next };
    });
  };

  const setItemQty = (id: string, value: number, maxQty: number) => {
    const safeQty = Math.max(1, Math.min(maxQty, value));
    setQuantities((prev) => ({ ...prev, [id]: safeQty }));
  };

  const selectAll = () => {
    const nextSelected: Record<string, boolean> = {};
    const nextQtys: Record<string, number> = {};
    availableItems.forEach((it) => {
      const maxUnits = it.remainingUnits ?? 1;
      nextSelected[it.id] = true;
      nextQtys[it.id] = quantities[it.id] || maxUnits;
    });
    setSelectedIds(nextSelected);
    setQuantities(nextQtys);
  };

  const deselectAll = () => {
    setSelectedIds({});
  };

  const selectedItems = availableItems
    .filter((item) => selectedIds[item.id])
    .map((item) => {
      const maxUnits = item.remainingUnits ?? 1;
      const qty = Math.min(maxUnits, quantities[item.id] ?? 1);
      const estLineRefund = item.price > 0 && item.purchasedBase > 0
        ? Math.round((item.price * (qty * item.conversion)) / item.purchasedBase)
        : 0;
      return { item, qty, estLineRefund };
    });

  const totalEstRefund = selectedItems.reduce((sum, it) => sum + it.estLineRefund, 0);
  const canSubmit = selectedItems.length > 0 && reason.trim().length >= 3 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      const payload = {
        source: "customer",
        transaction_id: transaction.id,
        refund_method: transaction.payment,
        reason: reason.trim(),
        items: selectedItems.map(({ item, qty }) => ({
          transaction_item_id: item.id,
          quantity_in_base: qty * item.conversion,
        })),
      };

      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        const code = body.error?.code;
        if (code === "RETURN_QUANTITY_EXCEEDED") {
          throw new Error("Jumlah barang yang dapat diretur sudah berubah. Periksa kembali transaksi.");
        }
        if (code === "RETURN_REASON_REQUIRED") {
          throw new Error("Alasan retur wajib diisi.");
        }
        throw new Error(body.error?.message ?? "Gagal mengirim permintaan retur.");
      }

      setSuccessResult({
        returnId: body.data.returnId,
        refundTotal: body.data.refundTotal,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem saat mengajukan retur.");
    } finally {
      setBusy(false);
    }
  };

  const paymentLabel =
    transaction.payment === "cash"
      ? "Tunai"
      : transaction.payment === "qris"
      ? "QRIS"
      : transaction.payment === "bank_transfer"
      ? "Transfer Bank"
      : "Ditanggung BPJS";

  return (
    <Container size="xl" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request Retur Barang</h1>
          <p className="mt-1 text-sm text-gray-600">
            Faktur <strong className="font-semibold text-gray-900">{transaction.invoice}</strong> · Pembayaran: {paymentLabel}
          </p>
        </div>
        <Link
          href={`/transactions/${transaction.id}`}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          ← Kembali ke Transaksi
        </Link>
      </header>

      {successResult ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
              ✓
            </span>
            <h2 className="mt-3 text-lg font-semibold text-emerald-950">Permintaan Retur Berhasil Diajukan</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Pengajuan retur Anda telah dicatat dengan status <strong>Menunggu Persetujuan Admin (Pending Approval)</strong>.
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-900">
              Perkiraan Refund: {formatRupiah(successResult.refundTotal)}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={`/transactions/${transaction.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Lihat Detail Transaksi
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {allCompleted ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-5 text-center text-sm font-medium text-amber-900">
                Semua barang pada transaksi ini sudah diretur atau sedang dalam proses retur.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Selectable Cards Section */}
              <section aria-labelledby="items-selection-title">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="items-selection-title" className="text-lg font-semibold text-gray-900">
                      Pilih Barang yang Diretur
                    </h2>
                    <p className="text-xs text-gray-500">
                      Pilih satu, beberapa, atau semua barang yang ingin diajukan untuk retur.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Batal Pilih
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {transaction.items.map((item) => {
                    const isAvailable = item.remainingBase > 0;
                    const maxUnits = item.remainingUnits ?? 1;
                    const isSelected = Boolean(selectedIds[item.id]);
                    const currentQty = quantities[item.id] ?? 1;

                    return (
                      <div
                        key={item.id}
                        className={`relative flex flex-col justify-between rounded-xl border p-4 transition ${
                          !isAvailable
                            ? "border-gray-200 bg-gray-50 opacity-60"
                            : isSelected
                            ? "border-brand-500 bg-blue-50/20 shadow-sm ring-1 ring-brand-500"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={!isAvailable}
                                checked={isSelected}
                                onChange={() => toggleSelect(item.id, maxUnits)}
                                className="mt-1 size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{item.name}</h3>
                                <p className="mt-0.5 text-xs font-medium text-brand-600">{formatRupiah(item.price)}</p>
                              </div>
                            </label>
                            <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              {item.unit}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                            <div>
                              <span className="block text-[11px] text-gray-400">Dibeli</span>
                              <strong className="text-gray-900">{item.purchasedUnits ?? item.purchasedBase} {item.unit}</strong>
                            </div>
                            <div>
                              <span className="block text-[11px] text-gray-400">Diretur</span>
                              <strong className="text-gray-900">{item.returnedUnits ?? item.returnedBase} {item.unit}</strong>
                            </div>
                            <div>
                              <span className="block text-[11px] text-gray-400">Sisa Tersedia</span>
                              <strong className={isAvailable ? "text-emerald-700" : "text-gray-400"}>
                                {item.remainingUnits ?? item.remainingBase} {item.unit}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {isSelected && isAvailable ? (
                          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                            <span className="text-xs font-semibold text-gray-700">Jumlah Retur:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={currentQty <= 1}
                                onClick={() => setItemQty(item.id, currentQty - 1, maxUnits)}
                                className="grid size-8 place-items-center rounded border border-gray-300 bg-white text-base font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={maxUnits}
                                value={currentQty}
                                onChange={(e) => setItemQty(item.id, parseInt(e.target.value, 10) || 1, maxUnits)}
                                className="h-8 w-14 rounded border border-gray-300 text-center text-sm font-semibold tabular outline-none"
                              />
                              <button
                                type="button"
                                disabled={currentQty >= maxUnits}
                                onClick={() => setItemQty(item.id, currentQty + 1, maxUnits)}
                                className="grid size-8 place-items-center rounded border border-gray-300 bg-white text-base font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                              >
                                +
                              </button>
                              <span className="ml-1 text-xs text-gray-500">/ {maxUnits}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Ringkasan Item Terpilih di atas field Alasan Retur */}
              {selectedItems.length > 0 ? (
                <Card className="border-blue-200 bg-blue-50/40">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-blue-950">Ringkasan Barang yang Diajukan</h3>
                    <ul className="mt-3 divide-y divide-blue-200/60 text-sm">
                      {selectedItems.map(({ item, qty, estLineRefund }) => (
                        <li key={item.id} className="flex items-center justify-between py-2">
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-600">
                              {qty} {item.unit}
                            </p>
                          </div>
                          <span className="tabular font-semibold text-gray-900">{formatRupiah(estLineRefund)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between border-t border-blue-200 pt-3">
                      <span className="text-sm font-semibold text-blue-950">Perkiraan Total Refund:</span>
                      <strong className="text-lg font-bold tabular text-brand-600">
                        {formatRupiah(totalEstRefund)}
                      </strong>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Form Input Alasan Retur */}
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <label htmlFor="return-reason" className="block text-sm font-semibold text-gray-900">
                      Alasan Retur <span className="text-red-500">*</span>
                    </label>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Jelaskan alasan pengembalian barang secara lengkap untuk ditinjau oleh Admin.
                    </p>
                    <textarea
                      id="return-reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Contoh: Kemasan obat robek saat dibuka pelanggan, salah ambil dosis..."
                      className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      maxLength={500}
                    />
                  </div>

                  {error ? (
                    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-gray-500">
                      * Permintaan retur memerlukan persetujuan Admin sebelum dana dikembalikan dan stok diperbarui.
                    </p>
                    <Button
                      type="button"
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                      className="min-h-11 px-6 font-semibold"
                    >
                      {busy ? "Mengirim Request…" : "Kirim Request Retur"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </Container>
  );
}

