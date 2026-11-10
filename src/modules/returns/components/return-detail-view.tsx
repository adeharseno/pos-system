"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRupiah } from "@/modules/ui/currency";
import { formatReceiptDate } from "@/modules/sales/receipt";
import { Button, Card, CardContent, CardHeader, Container } from "@/modules/ui/components";
import type { ItemCondition, ReturnDetail, ReturnStatus } from "../types";

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  if (status === "pending_approval") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        Menunggu Persetujuan Admin (Pending Approval)
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
        Disetujui Admin (Approved)
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        Selesai / Refund Dibayarkan (Completed)
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
      Ditolak (Rejected)
    </span>
  );
}

export function ReturnDetailView({
  detail,
  canApprove,
  canComplete,
}: {
  detail: ReturnDetail;
  canApprove: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [adminNotes, setAdminNotes] = useState(detail.adminNotes || "");
  const [conditions, setConditions] = useState<Record<string, ItemCondition>>(() => {
    const init: Record<string, ItemCondition> = {};
    detail.items.forEach((it) => {
      init[it.id] = it.condition || "good";
    });
    return init;
  });
  const [confirmRefundNow, setConfirmRefundNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isPending = detail.status === "pending_approval";
  const isApproved = detail.status === "approved";
  const isRejected = detail.status === "rejected";
  const isCompleted = detail.status === "completed";

  const handleApprove = async () => {
    if (!adminNotes.trim()) {
      setError("Catatan admin wajib diisi untuk menyetujui retur.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const itemConditions = Object.entries(conditions).map(([returnItemId, condition]) => ({
        return_item_id: returnItemId,
        condition,
      }));

      const res = await fetch(`/api/returns/${detail.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          admin_notes: adminNotes.trim(),
          item_conditions: itemConditions,
          confirm_refund: confirmRefundNow,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Gagal menyetujui retur.");
      }

      setFeedback("Permintaan retur berhasil disetujui!");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyetujui retur.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!adminNotes.trim()) {
      setError("Catatan admin wajib diisi saat menolak retur (alasan penolakan).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/returns/${detail.id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          admin_notes: adminNotes.trim(),
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Gagal menolak retur.");
      }

      setFeedback("Permintaan retur telah ditolak. Alasan penolakan telah dicatat.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menolak retur.");
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteRefund = async () => {
    setBusy(true);
    setError(null);
    try {
      const itemConditions = Object.entries(conditions).map(([returnItemId, condition]) => ({
        return_item_id: returnItemId,
        condition,
      }));

      const res = await fetch(`/api/returns/${detail.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item_conditions: itemConditions }),
      });

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Gagal menyelesaikan refund.");
      }

      setFeedback("Refund berhasil dikonfirmasi dan stok layak jual telah dikembalikan ke inventory!");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat mengonfirmasi refund.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container size="xl" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detail Retur Barang</h1>
          <p className="mt-1 text-sm text-gray-600">
            {detail.returnNumber ? (
              <>
                Nota Retur: <strong className="font-semibold text-gray-900">{detail.returnNumber}</strong> ·{" "}
              </>
            ) : null}
            Faktur Asli:{" "}
            <Link
              href={`/transactions/${detail.transactionId}`}
              className="font-semibold text-brand-600 hover:underline"
            >
              {detail.invoiceNumber}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.returnNumber ? (
            <Link
              href={`/returns/${detail.id}/receipt`}
              target="_blank"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-brand-600 bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100"
            >
              Cetak Nota Retur
            </Link>
          ) : null}
          <Link
            href="/returns"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ← Kembali ke Daftar Retur
          </Link>
        </div>
      </header>

      {feedback ? (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800 border border-emerald-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Metadata & Items */}
        <div className="space-y-6 lg:col-span-2">
          {/* Status & Information */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Informasi Permintaan Retur</h2>
                <ReturnStatusBadge status={detail.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Nomor Retur</dt>
                  <dd className="mt-1 font-semibold text-gray-900">
                    {detail.returnNumber || "(Belum Disetujui)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Nomor Faktur Asli</dt>
                  <dd className="mt-1 font-semibold text-brand-600">
                    <Link href={`/transactions/${detail.transactionId}`} className="hover:underline">
                      {detail.invoiceNumber}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Tanggal Pengajuan</dt>
                  <dd className="mt-1 text-gray-900">{formatReceiptDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Kasir Pengaju</dt>
                  <dd className="mt-1 text-gray-900">{detail.cashierName}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Metode Pengembalian Dana</dt>
                  <dd className="mt-1 font-medium text-gray-900 uppercase">{detail.refundMethod}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Status Refund</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        detail.refundStatus === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {detail.refundStatus === "completed" ? "Refund Sudah Dibayarkan" : "Refund Belum Dibayarkan"}
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Alasan Kasir</p>
                <p className="mt-1 text-sm text-gray-900">{detail.reason}</p>
              </div>

              {detail.adminNotes ? (
                <div
                  className={`mt-4 rounded-lg p-3 text-sm ${
                    isRejected
                      ? "border border-red-200 bg-red-50 text-red-950"
                      : "border border-gray-200 bg-gray-50 text-gray-900"
                  }`}
                >
                  <p className="font-semibold text-xs uppercase tracking-wider">
                    {isRejected ? "Alasan Penolakan Admin:" : "Catatan Admin:"}
                  </p>
                  <p className="mt-0.5">{detail.adminNotes}</p>
                  {detail.reviewerName ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Oleh: {detail.reviewerName}
                      {detail.reviewedAt ? ` · ${formatReceiptDate(detail.reviewedAt)}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Barang yang Diretur</h2>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-700">
                    <tr>
                      <th className="px-4 py-3 sm:px-6">Nama Obat</th>
                      <th className="px-4 py-3 text-center">Jumlah</th>
                      <th className="px-4 py-3 text-right">Harga Satuan</th>
                      <th className="px-4 py-3 text-right">Refund</th>
                      <th className="px-4 py-3">Kondisi Fisik</th>
                      <th className="px-4 py-3">Status Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {detail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-4 py-3.5 font-medium text-gray-900 sm:px-6">{it.productName}</td>
                        <td className="px-4 py-3.5 text-center font-semibold text-gray-900">
                          {it.quantityInUnit} {it.unitName}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular text-gray-700">
                          {formatRupiah(it.unitPrice)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-gray-900 tabular">
                          {formatRupiah(it.refundTotal)}
                        </td>
                        <td className="px-4 py-3.5">
                          {isPending && canApprove ? (
                            <select
                              value={conditions[it.id] ?? "good"}
                              onChange={(e) =>
                                setConditions((prev) => ({
                                  ...prev,
                                  [it.id]: e.target.value as ItemCondition,
                                }))
                              }
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800"
                            >
                              <option value="good">Layak Jual (Restock)</option>
                              <option value="damaged">Rusak (Jangan Jual)</option>
                              <option value="expired">Kedaluwarsa (Jangan Jual)</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                                it.condition === "good"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-red-50 text-red-800"
                              }`}
                            >
                              {it.condition === "good"
                                ? "Layak Jual"
                                : it.condition === "damaged"
                                ? "Rusak"
                                : "Kedaluwarsa"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {it.isRestocked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <span className="size-1.5 rounded-full bg-emerald-600"></span>
                              Masuk Stok
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <span className="size-1.5 rounded-full bg-gray-400"></span>
                              Belum/Tidak Restock
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Financial Summary & Admin Decision */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Ringkasan Refund</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal Refund</span>
                <span className="tabular font-medium">{formatRupiah(detail.refundSubtotal)}</span>
              </div>
              {detail.refundTaxAmount > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pajak Refund</span>
                  <span className="tabular font-medium">{formatRupiah(detail.refundTaxAmount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-base font-bold text-gray-900">
                <span>Total Pengembalian Dana</span>
                <span className="text-xl tabular text-brand-600">{formatRupiah(detail.refundTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Admin Approval / Action Panel */}
          {canApprove && isPending ? (
            <Card className="border-brand-200 bg-brand-50/20">
              <CardHeader>
                <h2 className="text-base font-bold text-gray-900">Persetujuan Admin</h2>
                <p className="text-xs text-gray-500">
                  Tinjau fisik barang dan berikan catatan wajib sebelum menyetujui atau menolak.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="admin-notes" className="block text-xs font-semibold uppercase text-gray-700">
                    Catatan Admin (Wajib) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="admin-notes"
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Contoh: Barang fisik sudah dicek utuh dan tersegel..."
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRefundNow}
                    onChange={(e) => setConfirmRefundNow(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-gray-300 text-brand-600"
                  />
                  <span>
                    <strong>Barang fisik sudah diterima &amp; refund langsung dibayarkan</strong>
                    <br />
                    Centang untuk menyelesaikan status retur dan mengembalikan stok layak jual sekaligus.
                  </span>
                </label>

                {error ? <p role="alert" className="text-xs font-medium text-red-600">{error}</p> : null}

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    disabled={busy || !adminNotes.trim()}
                    onClick={handleReject}
                    className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    {busy ? "Memproses…" : "Tolak Retur"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !adminNotes.trim()}
                    onClick={handleApprove}
                    className="min-h-11 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {busy ? "Memproses…" : "Setujui Retur"}
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Action if Approved but Refund Pending */}
          {canComplete && isApproved && detail.refundStatus === "pending" ? (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader>
                <h2 className="text-base font-bold text-amber-950">Konfirmasi Pembayaran Refund</h2>
                <p className="text-xs text-amber-800">
                  Permintaan ini sudah disetujui. Konfirmasi ketika uang refund sudah diserahkan ke pelanggan dan barang fisik diterima.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {error ? <p role="alert" className="text-xs font-medium text-red-600">{error}</p> : null}
                <Button
                  type="button"
                  disabled={busy}
                  onClick={handleCompleteRefund}
                  className="w-full min-h-11 bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? "Memproses…" : "Konfirmasi Refund Dibayarkan & Terima Barang"}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </Container>
  );
}

