"use client";

import { useRef, useState } from "react";

import { stockMovementQuery, type StockMovementFilters } from "@/modules/inventory/stock-movement-filters";

export function StockMovementExportButton({ productId, filters }: { productId: string; filters: StockMovementFilters }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);

  async function download() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      const query = stockMovementQuery(filters);
      const response = await fetch(`/api/products/${productId}/stock-movements/export${query ? `?${query}` : ""}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "File Excel belum dapat dibuat. Silakan coba lagi.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "riwayat-stok.xlsx";
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File Excel belum dapat dibuat. Silakan coba lagi.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return <div className="grid gap-2"><button type="button" onClick={download} disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-base font-medium text-gray-800 disabled:opacity-60">{busy ? "Menyiapkan Excel…" : "Export Excel"}</button>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}</div>;
}
