"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardHeader, FormField, Input, Label } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";

type Expense = { id: string; expense_date: string; category: string; description: string | null; amount: string };
type List = { items: Expense[]; total: number; page: number; pageSize: number };
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

function moneyCents(value: string) {
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) throw new Error("Nominal pengeluaran tidak valid.");
  return BigInt(match[1]) * BigInt(100) + BigInt(match[2]);
}
function rupiah(value: bigint) {
  const fraction = value % BigInt(100);
  return `Rp ${(value / BigInt(100)).toLocaleString("id-ID")}${fraction ? `,${String(fraction).padStart(2, "0")}` : ""}`;
}

export function ExpenseWorkspace({ today }: { today: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState({ from: today, to: today, page: 1 });
  const [list, setList] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(today);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setListError("");
      try {
        const query = new URLSearchParams({ from: filter.from, to: filter.to, page: String(filter.page) });
        const response = await fetch(`/api/expenses?${query}`, { signal: controller.signal, cache: "no-store" });
        const result: ApiResult<List> = await response.json();
        if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error.message : "Daftar pengeluaran tidak dapat dimuat.");
        if (!controller.signal.aborted) setList(result.data);
      } catch (cause) {
        if (!controller.signal.aborted) { setList(null); setListError(cause instanceof Error ? cause.message : "Daftar pengeluaran tidak dapat dimuat. Silakan coba lagi."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [filter, revision]);

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) { setListError("Periksa tanggal awal dan tanggal akhir."); return; }
    setListError(""); setFilter({ from, to, page: 1 });
  }
  function close() { if (!submitting.current) { setOpen(false); setError(""); } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const decimal = amount.trim().replace(",", ".");
    if (!expenseDate || !category.trim()) { setError("Tanggal dan kategori wajib diisi."); return; }
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(decimal) || !/[1-9]/.test(decimal)) { setError("Masukkan nominal lebih dari nol, dengan maksimal dua angka desimal."); return; }
    submitting.current = true; setSaving(true); setError("");
    try {
      const response = await fetch("/api/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expense_date: expenseDate, category: category.trim(), description: description.trim() || null, amount: decimal }) });
      const result: ApiResult<unknown> = await response.json();
      if (!response.ok || !result.ok) throw new Error(!result.ok ? result.error.message : "Pengeluaran tidak dapat disimpan.");
      setOpen(false); setExpenseDate(today); setCategory(""); setDescription(""); setAmount(""); setRevision((current) => current + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengeluaran tidak dapat disimpan. Silakan coba lagi."); }
    finally { submitting.current = false; setSaving(false); }
  }

  const total = list?.items.reduce((sum, item) => sum + moneyCents(item.amount), BigInt(0)) ?? BigInt(0);
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize ?? 20)));
  return <section className="mt-6 grid gap-5">
    <div className="flex justify-end"><Button type="button" onClick={() => { setError(""); setOpen(true); }}>Tambah Pengeluaran</Button></div>
    <Card><CardContent><form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3"><FormField><Label htmlFor="expenses-from">Tanggal awal</Label><Input id="expenses-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></FormField><FormField><Label htmlFor="expenses-to">Tanggal akhir</Label><Input id="expenses-to" type="date" required value={to} onChange={(e) => setTo(e.target.value)} /></FormField><Button type="submit">Tampilkan</Button></form></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">Daftar Pengeluaran</h2></CardHeader><CardContent className="space-y-4">
      {loading ? <p role="status" className="text-sm">Memuat pengeluaran...</p> : null}
      {listError ? <p role="alert" className="text-sm text-[var(--danger)]">{listError}</p> : null}
      {!loading && !listError && list ? <>
        {list.items.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Tidak ada pengeluaran pada periode ini.</p> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--border)]"><th className="py-3 pr-4">Tanggal</th><th className="py-3 pr-4">Kategori</th><th className="py-3 pr-4">Keterangan</th><th className="py-3">Nominal</th></tr></thead><tbody>{list.items.map((item) => <tr key={item.id} className="border-b border-[var(--border)] last:border-0"><td className="py-3 pr-4">{item.expense_date}</td><td className="py-3 pr-4">{item.category}</td><td className="py-3 pr-4">{item.description || "—"}</td><td className="py-3">{rupiah(moneyCents(item.amount))}</td></tr>)}</tbody></table></div>
          <div className="grid gap-3 md:hidden">{list.items.map((item) => <div key={item.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm"><p className="font-semibold">{item.category}</p><p>{item.expense_date}</p><p className="break-words">{item.description || "—"}</p><p className="mt-2 font-medium">{rupiah(moneyCents(item.amount))}</p></div>)}</div>
        </>}
        <p className="font-semibold">Total pengeluaran pada halaman ini: {rupiah(total)}</p>
        {pages > 1 ? <nav aria-label="Halaman pengeluaran" className="flex flex-wrap items-center gap-3 text-sm"><Button type="button" variant="secondary" disabled={filter.page <= 1} onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}>Sebelumnya</Button><span>Halaman {list.page} dari {pages}</span><Button type="button" variant="secondary" disabled={filter.page >= pages} onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}>Selanjutnya</Button></nav> : null}
      </> : null}
    </CardContent></Card>
    <Modal open={open} labelledBy="expense-title" onClose={close}><ModalHeader id="expense-title" onClose={close}>Tambah Pengeluaran</ModalHeader><form onSubmit={save}><ModalContent><div className="grid gap-4"><FormField><Label htmlFor="expense-date">Tanggal</Label><Input id="expense-date" type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></FormField><FormField><Label htmlFor="expense-category">Kategori</Label><Input id="expense-category" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Sewa" /></FormField><FormField><Label htmlFor="expense-description">Keterangan (opsional)</Label><Input id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} /></FormField><FormField><Label htmlFor="expense-amount">Nominal</Label><Input id="expense-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Contoh: 12500,50" /><p className="text-xs text-[var(--text-muted)]">Gunakan koma atau titik untuk angka desimal, tanpa pemisah ribuan.</p></FormField>{error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}</div></ModalContent><ModalFooter><Button type="button" variant="secondary" onClick={close} disabled={saving}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Pengeluaran"}</Button></ModalFooter></form></Modal>
  </section>;
}
