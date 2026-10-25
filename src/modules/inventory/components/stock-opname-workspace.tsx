"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label, Textarea } from "@/modules/ui/components";

type OpnameItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string | null;
  batchId: string;
  batchNumber: string;
  expiredDate: string;
  systemQuantity: number;
  physicalQuantity: number | null;
  variance: number | null;
  notes: string | null;
};

type OpnameSession = {
  id: string;
  status: "in_progress" | "applied" | "cancelled";
  storageLocation: { id: string; fullCode: string } | null;
  startedBy: { id: string; name: string };
  startedAt: string;
  items: OpnameItem[];
};

type ApiResponse<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };

const errorMessages: Record<string, string> = {
  INVALID_STOCK_OPNAME_STATE: "Perhitungan stok ini sudah tidak aktif. Muat ulang halaman untuk melihat data terbaru.",
  STOCK_OPNAME_ITEM_NOT_FOUND: "Barang yang dipilih tidak ditemukan pada perhitungan stok ini.",
  STOCK_OPNAME_NOT_FOUND: "Sesi perhitungan stok tidak ditemukan.",
  PHYSICAL_QUANTITY_REQUIRED: "Semua barang harus dihitung sebelum perhitungan diselesaikan.",
  STOCK_OPNAME_IN_PROGRESS: "Masih ada perhitungan stok yang berlangsung.",
};

function messageFor(response: ApiResponse<unknown>, fallback: string) {
  return errorMessages[response.error?.code ?? ""] ?? response.error?.message ?? fallback;
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

export function StockOpnameWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<OpnameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "uncounted" | "counted">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [physicalQuantity, setPhysicalQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  const loadSession = useCallback(async (sessionId?: string) => {
    const endpoint = sessionId ? `/api/inventory/opname/${sessionId}` : "/api/inventory/opname/active";
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json() as ApiResponse<{ session: OpnameSession | null }>;
    if (!response.ok || !body.ok) throw new Error(messageFor(body, "Data perhitungan stok tidak dapat dimuat."));
    setSession(body.data?.session ?? null);
  }, []);

  useEffect(() => {
    let current = true;
    void Promise.resolve()
      .then(() => loadSession())
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Data perhitungan stok tidak dapat dimuat."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [loadSession]);

  const selectedItem = session?.items.find((item) => item.id === selectedId) ?? null;
  const counted = session?.items.filter((item) => item.physicalQuantity !== null).length ?? 0;
  const differenceCount = session?.items.filter((item) => item.physicalQuantity !== null && item.variance !== 0).length ?? 0;
  const uncounted = (session?.items.length ?? 0) - counted;
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("id-ID");
    return (session?.items ?? []).filter((item) => {
      const matchesQuery = !normalized || [item.productName, item.productSku, item.productBarcode ?? "", item.batchNumber]
        .some((value) => value.toLocaleLowerCase("id-ID").includes(normalized));
      const matchesFilter = filter === "all" || (filter === "counted" ? item.physicalQuantity !== null : item.physicalQuantity === null);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, session?.items]);

  function selectItem(item: OpnameItem) {
    setSelectedId(item.id);
    setPhysicalQuantity(item.physicalQuantity === null ? "" : String(item.physicalQuantity));
    setNotes(item.notes ?? "");
    setError("");
    setSuccess("");
  }

  async function startSession() {
    if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/stock-opname", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json() as ApiResponse<{ sessionId: string }>;
      if (!response.ok || !body.ok || !body.data?.sessionId) throw new Error(messageFor(body, "Perhitungan stok tidak dapat dimulai."));
      await loadSession(body.data.sessionId);
      setSuccess("Perhitungan stok dimulai. Pilih barang mana saja untuk mulai menghitung.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perhitungan stok tidak dapat dimulai.");
    } finally { setBusy(false); }
  }

  async function saveCount() {
    if (!session || !selectedItem || busy) return;
    const quantity = Number(physicalQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      setError("Jumlah barang yang ditemukan harus berupa bilangan bulat 0 atau lebih.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/inventory/opname/${session.id}/items/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ physical_quantity: quantity, notes }),
      });
      const body = await response.json() as ApiResponse<unknown>;
      if (!response.ok || !body.ok) throw new Error(messageFor(body, "Jumlah barang tidak dapat disimpan."));
      await loadSession(session.id);
      setSuccess("Jumlah barang berhasil disimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Jumlah barang tidak dapat disimpan.");
    } finally { setBusy(false); }
  }

  async function cancelSession() {
    if (!session || busy || !window.confirm("Batalkan perhitungan stok ini? Jumlah yang sudah disimpan tidak akan diterapkan ke stok.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/stock-opname/${session.id}/cancel`, { method: "POST" });
      const body = await response.json() as ApiResponse<unknown>;
      if (!response.ok || !body.ok) throw new Error(messageFor(body, "Perhitungan stok tidak dapat dibatalkan."));
      setSession(null); setSelectedId(null); setSuccess("Perhitungan stok dibatalkan."); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perhitungan stok tidak dapat dibatalkan.");
    } finally { setBusy(false); }
  }

  async function finalizeSession() {
    if (!session || busy) return;
    if (uncounted > 0) { setError(`Masih ada ${uncounted} barang yang belum dihitung. Selesaikan semua hitungan terlebih dahulu.`); return; }
    if (!window.confirm("Selesaikan perhitungan stok? Stok batch akan disesuaikan berdasarkan jumlah yang sudah Anda simpan.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/stock-opname/${session.id}/apply`, { method: "POST" });
      const body = await response.json() as ApiResponse<unknown>;
      if (!response.ok || !body.ok) throw new Error(messageFor(body, "Perhitungan stok tidak dapat diselesaikan."));
      await loadSession(session.id);
      setSuccess("Perhitungan stok telah selesai dan stok sudah diperbarui."); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perhitungan stok tidak dapat diselesaikan.");
    } finally { setBusy(false); }
  }

  if (loading) return <Card><CardContent className="p-8 text-center text-sm text-[var(--text-muted)]">Memuat perhitungan stok…</CardContent></Card>;

  if (!session) return <div className="grid gap-5">{error ? <p role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}{success ? <p role="status" className="rounded-[var(--radius)] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}<Card><CardHeader><h2 className="text-lg font-semibold">Mulai Hitung Stok</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Mulai saat Anda siap menghitung stok. Selama proses berlangsung, perubahan stok lain akan ditahan agar hasil tetap akurat.</p></CardHeader><CardContent><Button type="button" onClick={startSession} disabled={busy}>{busy ? "Memulai…" : "Mulai Hitung Stok"}</Button></CardContent></Card></div>;

  if (session.status !== "in_progress") return <div className="grid gap-5">{error ? <p role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}{success ? <p role="status" className="rounded-[var(--radius)] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}<Card><CardHeader><h2 className="text-lg font-semibold">Perhitungan Stok Selesai</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Hasil perhitungan sudah diterapkan. Stok terbaru dapat dilihat di persediaan.</p></CardHeader><CardContent><Button type="button" onClick={() => router.push("/inventory")}>Lihat Persediaan</Button></CardContent></Card></div>;

  return <div className="grid gap-5">
    <Card><CardContent className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-[var(--text-muted)]">Kemajuan</p><p className="mt-1 text-xl font-semibold">{counted} dari {session.items.length} barang sudah dihitung</p></div><div><p className="text-sm text-[var(--text-muted)]">Belum dihitung</p><p className="mt-1 text-xl font-semibold">{uncounted} barang</p></div><div><p className="text-sm text-[var(--text-muted)]">Ada selisih</p><p className="mt-1 text-xl font-semibold">{differenceCount} barang</p></div><p className="text-sm text-[var(--text-muted)] sm:col-span-3">Dimulai oleh {session.startedBy.name} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}{session.storageLocation ? ` · Lokasi ${session.storageLocation.fullCode}` : " · Seluruh apotek"}</p></CardContent></Card>

    {error ? <p role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
    {success ? <p role="status" className="rounded-[var(--radius)] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p> : null}

    {selectedItem ? <Card><CardHeader><h2 className="text-lg font-semibold">Hitung Barang</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{selectedItem.productName} · Batch {selectedItem.batchNumber}</p></CardHeader><CardContent className="grid gap-5"><div className="grid gap-3 rounded-[var(--radius)] bg-[var(--surface-subtle)] p-4 text-sm sm:grid-cols-3"><div><p className="text-[var(--text-muted)]">SKU</p><strong>{selectedItem.productSku}</strong></div><div><p className="text-[var(--text-muted)]">Tanggal kedaluwarsa</p><strong>{formatDate(selectedItem.expiredDate)}</strong></div><div><p className="text-[var(--text-muted)]">Jumlah menurut sistem</p><strong>{selectedItem.systemQuantity}</strong></div></div><FormField><Label htmlFor="physical-quantity">Jumlah barang yang ditemukan</Label><Input id="physical-quantity" type="number" min="0" step="1" inputMode="numeric" value={physicalQuantity} onChange={(event) => setPhysicalQuantity(event.target.value)} disabled={busy} placeholder="Masukkan jumlah, termasuk 0 bila tidak ada" /><p className="text-sm text-[var(--text-muted)]">Kosong berarti belum dihitung. Isi 0 bila barang tidak ditemukan.</p></FormField><FormField><Label htmlFor="opname-notes">Catatan (opsional)</Label><Textarea id="opname-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} placeholder="Contoh: kemasan rusak atau disimpan di etalase" /></FormField><FormActions><Button type="button" variant="secondary" onClick={() => setSelectedId(null)} disabled={busy}>Kembali ke daftar</Button><Button type="button" onClick={saveCount} disabled={busy}>{busy ? "Menyimpan…" : "Simpan Jumlah"}</Button></FormActions></CardContent></Card> : null}

    <Card><CardHeader><h2 className="text-lg font-semibold">Daftar Barang</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Pilih barang atau batch mana saja. Anda dapat kembali untuk memperbaiki jumlah yang sudah disimpan.</p></CardHeader><CardContent className="grid gap-4"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama barang atau pindai barcode" aria-label="Cari nama barang atau pindai barcode" /><div className="flex flex-wrap gap-2">{(["all", "uncounted", "counted"] as const).map((value) => <Button key={value} type="button" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)} disabled={busy}>{value === "all" ? "Semua" : value === "uncounted" ? "Belum Dihitung" : "Sudah Dihitung"}</Button>)}</div><div className="grid gap-3">{filteredItems.map((item) => <button key={item.id} type="button" onClick={() => selectItem(item)} className="grid w-full gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-subtle)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><strong>{item.productName}</strong><p className="mt-1 text-sm text-[var(--text-muted)]">{item.productSku} · Batch {item.batchNumber} · Kedaluwarsa {formatDate(item.expiredDate)}</p></div><p className="text-sm">Sistem: <strong>{item.systemQuantity}</strong></p><span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${item.physicalQuantity === null ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{item.physicalQuantity === null ? "Belum Dihitung" : "Sudah Dihitung"}</span></button>)}{filteredItems.length === 0 ? <p className="py-6 text-center text-sm text-[var(--text-muted)]">Tidak ada barang yang sesuai.</p> : null}</div></CardContent></Card>

    <Card><CardHeader><h2 className="text-lg font-semibold">Selesaikan Perhitungan</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Periksa semua hasil sebelum menyelesaikan. Barang yang belum dihitung tidak akan dianggap nol.</p></CardHeader><CardContent><div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => setReviewOpen((open) => !open)} disabled={busy}>Periksa Hasil</Button><Button type="button" onClick={finalizeSession} disabled={busy || uncounted > 0}>Selesaikan Perhitungan</Button><Button type="button" variant="danger" onClick={cancelSession} disabled={busy}>Batalkan Perhitungan</Button></div>{reviewOpen ? <div className="mt-5 grid gap-3">{session.items.filter((item) => item.physicalQuantity !== null).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-sm"><span><strong>{item.productName}</strong> · Batch {item.batchNumber}</span><span>Sistem {item.systemQuantity} · Ditemukan {item.physicalQuantity} · <strong className={item.variance === 0 ? "text-emerald-700" : "text-[var(--danger)]"}>{item.variance === 0 ? "Sesuai" : `Selisih ${item.variance}`}</strong></span></div>)}</div> : null}</CardContent></Card>
  </div>;
}
