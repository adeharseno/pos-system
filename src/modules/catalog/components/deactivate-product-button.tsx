"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/modules/ui/components";

export function DeactivateProductButton({ productId }: { productId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function deactivate() {
    if (busy || !confirm("Produk akan disembunyikan dari alur penjualan kasir. Riwayat transaksi tetap tersimpan. Lanjutkan?")) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/products/${productId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_active: false }) }); if (!response.ok) { setError("Produk gagal dinonaktifkan."); return; } router.push(`/products/${productId}`); router.refresh(); } catch { setError("Produk gagal dinonaktifkan."); } finally { setBusy(false); }
  }
  return <div className="grid gap-2">{error ? <p className="text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<Button type="button" variant="danger" disabled={busy} onClick={deactivate}>{busy ? "Menonaktifkan…" : "Nonaktifkan Produk"}</Button></div>;
}
