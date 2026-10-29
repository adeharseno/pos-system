"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Input, Label } from "@/modules/ui/components";

type Supplier = { id: string; name: string };
export function SupplierPicker({ value, onChange, disabled }: { value: Supplier | null; onChange: (value: Supplier | null) => void; disabled: boolean }) {
  const listId = useId();
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/suppliers?q=${encodeURIComponent(value && query === value.name ? "" : query)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error();
        setRows(body.data.rows); setActive(-1);
      } catch { if (!controller.signal.aborted) { setRows([]); setError("Pemasok belum dapat dimuat. Ketik kembali untuk mencoba."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, value]);
  const choose = (supplier: Supplier) => { onChange(supplier); setQuery(supplier.name); setOpen(false); };
  return <div ref={root} className="relative grid gap-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Label htmlFor="supplier-search">Nama Pemasok</Label>
    <Input id="supplier-search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" required disabled={disabled} value={query}
      placeholder="Cari dan pilih pemasok" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); onChange(null); setOpen(true); setActive(-1); setRows([]); }}
      onKeyDown={event => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter" && open) { event.preventDefault(); if (active >= 0 && rows[active]) choose(rows[active]); }
      }} />
    <input type="hidden" name="supplier_id" value={value?.id ?? ""} />
    {open ? <div className="absolute inset-x-0 top-[5.5rem] z-20 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg"><ul id={listId} role="listbox" aria-label="Pilih pemasok" className="max-h-64 overflow-y-auto">
      {rows.map((supplier, index) => <li id={`${listId}-${index}`} key={supplier.id} role="option" aria-selected={value?.id === supplier.id} className={`cursor-pointer px-4 py-4 text-base ${active === index ? "bg-brand-50" : "hover:bg-gray-50"}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(supplier)}>{supplier.name}</li>)}
    </ul>{loading ? <p role="status" className="p-4">Memuat pemasok...</p> : error ? <p role="alert" className="p-4 text-red-800">{error}</p> : !rows.length ? <p className="p-4">Pemasok tidak ditemukan.</p> : <p className="border-t p-3 text-sm text-gray-600">Ketik nama lebih lengkap untuk mempersempit pilihan.</p>}</div> : null}
    <Link href="/products/suppliers" target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 text-base font-medium text-brand-600 underline">Tambah Pemasok (tab baru)</Link>
  </div>;
}
