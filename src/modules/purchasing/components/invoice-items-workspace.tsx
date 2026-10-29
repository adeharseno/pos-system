"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FinalizeReceivingButton } from "./finalize-receiving-button";
import { useRef, useState } from "react";
import { Button, Card, CardContent, FormActions, FormField, Input, Label, Select, Checkbox } from "@/modules/ui/components";
import { Modal, ModalContent, ModalHeader } from "@/modules/ui/modal";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";
import { InvoiceForm, type InvoiceDraft } from "./invoice-form";
import type { InvoiceItem } from "../invoice-item-repository";
import { blankItemFields, changeItemPrice, fieldsForProduct, formatItemCents, itemSubtotalCents, parseInvoiceItem, type InvoiceProduct, type ItemFields } from "../invoice-item-input";
import { moneyCents, PAYMENT_LABELS, paymentStatus } from "../invoice-input";
import { formatInvoiceAmount } from "../invoice-presentation";

type Mutation = { action: "create" | "update" | "delete"; body: Record<string, unknown>; itemId: string };
type SearchRow = { id: string; name: string; sku: string };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok || !body.ok) throw Object.assign(new Error(body.error?.message ?? "Data belum dapat dimuat."), { status: response.status });
  return body.data as T;
}

export function InvoiceItemsWorkspace({ initialInvoice, initialItems }: { initialInvoice: InvoiceDraft; initialItems: InvoiceItem[] }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [product, setProduct] = useState<InvoiceProduct | null>(null);
  const [fields, setFields] = useState<ItemFields>(blankItemFields);
  const [editing, setEditing] = useState<InvoiceItem | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerWorking, setHeaderWorking] = useState(false);
  const pending = useRef<Mutation | null>(null);
  const newItemId = useRef("");
  const searchRequest = useRef(0);
  const url = `/api/purchase-invoices/${invoice.id}`;
  const locked = busy || uncertain;
  const sum = items.reduce((total, item) => total + itemSubtotalCents(String(item.cost_price), String(item.quantity), String(item.tax_rate)), BigInt(0));
  const difference = sum - BigInt(moneyCents(String(invoice.total_amount)));
  const paid = invoice.purchase_invoice_payments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0);
  const previousUnit = product?.units.find(unit => unit.id === fields.product_unit_id);
  const previous = product && previousUnit ? fieldsForProduct(product, previousUnit.id) : null;
  let preview: string | null = null;
  try { preview = formatItemCents(itemSubtotalCents(fields.cost_price, fields.quantity, fields.tax_rate)); } catch { /* Incomplete form. */ }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const token = ++searchRequest.current;
    setSearching(true); setError("");
    try { const rows = await api<SearchRow[]>(`${url}/products?q=${encodeURIComponent(query.trim())}`); if (token === searchRequest.current) { setResults(rows); setSearched(true); } }
    catch (cause) { if (token === searchRequest.current) setError((cause as Error).message); }
    finally { if (token === searchRequest.current) setSearching(false); }
  }
  async function selectProduct(id: string) {
    if (dirty && !confirm("Ganti produk? Isian barang yang belum disimpan akan diganti.")) return;
    setBusy(true); setError("");
    try {
      const selected = await api<InvoiceProduct>(`${url}/products/${id}`);
      setProduct(selected); setFields(fieldsForProduct(selected, selected.units[0].id)); setEditing(null); setDirty(false); newItemId.current = "";
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function edit(item: InvoiceItem) {
    if (dirty && !confirm("Buka barang ini? Isian barang yang belum disimpan akan diganti.")) return;
    setBusy(true); setError("");
    try {
      const selected = await api<InvoiceProduct>(`${url}/products/${item.product_id}`);
      setProduct(selected); setEditing(item); setDirty(false);
      setFields({ product_id: item.product_id, product_unit_id: item.product_unit_id, cost_price: String(item.cost_price), tax_rate: String(item.tax_rate), margin_percent: item.margin_percent === null ? "" : String(item.margin_percent), selling_price: String(item.selling_price), pricing_mode: item.pricing_mode as ItemFields["pricing_mode"], quantity: String(item.quantity), batch_number: item.batch_number, expired_date: item.expired_date, expiry_confirmed: false });
      document.getElementById("invoice-item-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function mutate(operation: Mutation) {
    pending.current = operation; setBusy(true); setError(""); setNotice("");
    try {
      await api(`${url}/items${operation.action === "create" ? "" : `/${operation.itemId}`}`, { method: operation.action === "create" ? "POST" : operation.action === "update" ? "PATCH" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(operation.body) });
      const latest = await api<InvoiceItem[]>(`${url}/items`);
      setItems(latest); pending.current = null; setUncertain(false);
      if (operation.action !== "delete") { setProduct(null); setEditing(null); setFields(blankItemFields()); setDirty(false); newItemId.current = ""; }
      setNotice(operation.action === "delete" ? "Barang dihapus dari invoice Draft." : "Barang tersimpan dalam invoice Draft.");
    } catch (cause) {
      const failure = cause as Error & { status?: number };
      setError(failure.message); setUncertain(!failure.status || failure.status >= 500);
      if (failure.status && failure.status < 500) { pending.current = null; try { setItems(await api<InvoiceItem[]>(`${url}/items`)); } catch { /* Keep the last visible list and all form values. */ } }
    } finally { setBusy(false); }
  }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); if (locked || !product) return;
    try { parseInvoiceItem(fields); } catch (cause) { setError((cause as Error).message); return; }
    if (!newItemId.current) newItemId.current = crypto.randomUUID();
    const id = editing?.id ?? newItemId.current;
    await mutate({ action: editing ? "update" : "create", itemId: id, body: { ...fields, id, request_id: crypto.randomUUID(), ...(editing ? { version: editing.version } : {}) } });
  }
  async function remove(item: InvoiceItem) {
    if (locked || !confirm(`Hapus ${item.product_name_snapshot}, batch ${item.batch_number}, dari invoice Draft?`)) return;
    await mutate({ action: "delete", itemId: item.id, body: { id: item.id, request_id: crypto.randomUUID(), version: item.version } });
  }
  async function openHeader() {
    try { const latest = await api<InvoiceDraft>(url); if (latest.status === "completed") { router.push(`/purchase-invoices/${invoice.id}`); return; } setInvoice(latest); setHeaderOpen(true); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function headerSaved() { setInvoice(await api<InvoiceDraft>(url)); setHeaderOpen(false); setHeaderWorking(false); setNotice("Informasi invoice diperbarui. Isian barang tetap tersedia."); }
  const setField = <K extends keyof ItemFields>(key: K, value: ItemFields[K]) => { setFields(current => ({ ...current, [key]: value })); setDirty(true); };

  return <div className="grid items-start gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
    <aside className="space-y-5 xl:sticky xl:top-6"><Card><CardContent><button type="button" onClick={() => void openHeader()} disabled={locked || headerWorking} className="block w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60">
      <span className="block text-lg font-semibold">Invoice Aktif · Draft</span><span className="mt-4 block break-words text-xl font-semibold">{invoice.invoice_number}</span><span className="mt-2 block break-words text-base">{invoice.suppliers?.name ?? "Pemasok tersimpan"}</span><span className="mt-2 block text-base">Tanggal: {invoice.invoice_date}</span><span className="mt-4 block text-base">Total Belanja: <strong>{formatInvoiceAmount(invoice.total_amount)}</strong></span><span className="mt-2 block text-base">{PAYMENT_LABELS[paymentStatus(Math.round(invoice.total_amount * 100), paid)]}</span><span className="mt-5 block min-h-12 rounded-lg border border-gray-300 px-4 py-3 text-center text-base font-medium">Lihat / Edit Invoice</span>
    </button></CardContent></Card><Card><CardContent className="space-y-4 text-base"><h2 className="text-lg font-semibold">Ringkasan Barang</h2><p>{items.length} baris barang / batch</p><p>Total Barang: <strong>{formatItemCents(sum)}</strong></p><p>Selisih: <strong>{formatItemCents(difference)}</strong></p><p className="text-gray-600">{difference === BigInt(0) ? "Total barang sesuai Total Belanja." : difference > BigInt(0) ? "Total barang lebih besar dari Total Belanja." : "Total barang lebih kecil dari Total Belanja."} Nilai invoice tidak diubah otomatis.</p></CardContent></Card></aside>
    <div className="min-w-0 space-y-6">
      {notice ? <p role="status" className="rounded-lg bg-green-50 p-4 text-base text-green-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-base text-red-800">{error}</p> : null}
      {uncertain ? <Card><CardContent className="space-y-4"><p>Hasil tindakan belum dapat dipastikan. Isian dipertahankan. Coba kembali dengan permintaan yang sama agar tidak menggandakan barang.</p><Button disabled={busy} onClick={() => { if (pending.current) void mutate(pending.current); }}>Coba Simpan Kembali</Button></CardContent></Card> : null}
      <Card><CardContent className="space-y-5"><h2 className="text-xl font-semibold">Cari Master Produk</h2><form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end"><FormField className="min-w-0 flex-1"><Label htmlFor="invoice-product-search">Nama Produk / SKU</Label><Input id="invoice-product-search" value={query} maxLength={80} required onChange={event => { setQuery(event.target.value); ++searchRequest.current; setResults([]); setSearched(false); setSearching(false); }} disabled={locked} placeholder="Ketik nama atau SKU" /></FormField><Button type="submit" disabled={locked || searching}>{searching ? "Mencari..." : "Cari Produk"}</Button></form>
        <ul className="divide-y divide-gray-200">{results.map(result => <li key={result.id}><button type="button" disabled={locked} onClick={() => void selectProduct(result.id)} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 py-4 text-left text-base disabled:opacity-60"><span className="min-w-0 break-words font-semibold">{result.name}<span className="mt-1 block break-all font-normal text-gray-600">SKU: {result.sku}</span></span><span className="rounded-lg border border-gray-300 px-4 py-3">Pilih Produk</span></button></li>)}</ul>
        {searched && !results.length ? <p className="text-base text-gray-600">Produk tidak ditemukan. Periksa nama atau SKU sebelum menambah master baru.</p> : null}<Link href="/products/new" target="_blank" rel="noopener noreferrer" className={productLinkClass}>Tambah Produk Baru (tab baru)</Link><p className="text-base text-gray-600">Setelah master disimpan, cari kembali di sini. SKU harus unik; data invoice tetap tersedia.</p>
      </CardContent></Card>
      {product ? <Card><CardContent><form id="invoice-item-form" onSubmit={saveItem} className="scroll-mt-5 space-y-6"><h2 className="break-words text-xl font-semibold">{editing ? "Edit Barang" : "Tambah Barang"}: {product.name}</h2><p className="text-base text-gray-600">SKU: {product.sku}. Harga modal dan jumlah menggunakan satuan yang dipilih.</p>
        {previous ? <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-base"><h3 className="font-semibold">Data Sebelumnya (pembanding)</h3><p>Harga Modal: {previous.cost_price === "" ? "Belum diatur" : formatInvoiceAmount(Number(previous.cost_price))}</p><p>Pajak: {previous.tax_rate}% · Margin: {previous.margin_percent === "" ? "Belum dapat dihitung" : `${previous.margin_percent}%`}</p><p>Harga Jual: {previous.selling_price === "" ? "Belum diatur" : formatInvoiceAmount(Number(previous.selling_price))} / {previousUnit?.name}</p><p>Kedaluwarsa sebelumnya: {product.previousExpiry ?? "Belum tersedia"}. Hanya referensi; periksa kemasan batch yang diterima.</p></div> : null}
        {fields.product_unit_id === null ? <p className="rounded-lg bg-amber-50 p-4 text-base text-amber-900">Unit dasar digunakan sebagai snapshot invoice. Isi harga yang valid; tidak ada unit jual baru yang dibuat.</p> : null}
        <fieldset disabled={locked} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <FormField className="sm:col-span-2"><Label htmlFor="item-unit">Satuan Diterima</Label><Select id="item-unit" value={fields.product_unit_id ?? "base"} onChange={event => { const id = event.target.value === "base" ? null : event.target.value; const prices = fieldsForProduct(product, id); setFields(current => ({ ...current, product_unit_id: id, cost_price: prices.cost_price, tax_rate: prices.tax_rate, margin_percent: prices.margin_percent, selling_price: prices.selling_price, pricing_mode: "selling_price" })); setDirty(true); }}>{product.units.map(unit => <option key={unit.id ?? "base"} value={unit.id ?? "base"}>{unit.name} ({unit.conversion} {product.baseUnit})</option>)}</Select><p className="text-base text-gray-600">Mengganti satuan memuat harga sebelumnya untuk satuan tersebut.</p></FormField>
          {([["cost_price", "Harga Modal (Rp)"], ["tax_rate", "Pajak (%)"], ["margin_percent", "Margin (%)"], ["selling_price", "Harga Jual (Rp)"]] as const).map(([key, label]) => <FormField key={key}><Label htmlFor={`item-${key}`}>{label}</Label><Input id={`item-${key}`} required={key !== "margin_percent" || fields.pricing_mode === "margin"} type="number" inputMode="decimal" min={key === "margin_percent" && fields.pricing_mode === "selling_price" ? "-100" : "0"} max={key === "tax_rate" ? "100" : undefined} step={key === "margin_percent" ? "any" : "0.01"} value={fields[key]} onChange={event => { setFields(current => changeItemPrice(current, key, event.target.value)); setDirty(true); }} /></FormField>)}
          <FormField><Label htmlFor="item-quantity">Jumlah Diterima</Label><Input id="item-quantity" required type="number" min="1" max="2147483647" step="1" value={fields.quantity} onChange={event => setField("quantity", event.target.value)} /></FormField>
          <FormField><Label htmlFor="item-batch">Nomor Batch</Label><Input id="item-batch" required maxLength={100} value={fields.batch_number} onChange={event => setField("batch_number", event.target.value)} /></FormField>
          <FormField><Label htmlFor="item-expiry">Tanggal Kedaluwarsa</Label><Input id="item-expiry" required type="date" value={fields.expired_date} onChange={event => { setFields(current => ({ ...current, expired_date: event.target.value, expiry_confirmed: false })); setDirty(true); }} /></FormField>
          <div className="sm:col-span-2"><Checkbox checked={fields.expiry_confirmed} required onChange={event => setField("expiry_confirmed", event.target.checked)} label="Tanggal kedaluwarsa sudah dicocokkan ulang dengan kemasan batch ini." /></div>
        </fieldset><p className="text-base font-semibold">Subtotal pembelian termasuk pajak: {preview ?? "Lengkapi harga, pajak, dan jumlah."}</p><p className="text-base text-gray-600">Harga jual tidak masuk subtotal pembelian. Stok dan harga master belum berubah.</p><FormActions>{editing ? <Button type="button" variant="secondary" disabled={locked} onClick={() => { if (dirty && !confirm("Batalkan perubahan barang yang belum disimpan?")) return; setEditing(null); setProduct(null); setFields(blankItemFields()); setDirty(false); }}>Batal Edit</Button> : null}<Button type="submit" disabled={locked}>{busy ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambahkan ke Invoice"}</Button></FormActions>
      </form></CardContent></Card> : null}
      <section className="space-y-5"><h2 className="text-xl font-semibold">Daftar Barang Invoice</h2>{!items.length ? <Card><CardContent>Belum ada barang pada invoice ini.</CardContent></Card> : items.map(item => <Card key={item.id}><CardContent className="space-y-4 text-base"><h3 className="break-words text-lg font-semibold">{item.product_name_snapshot}</h3><p className="break-all">SKU: {item.sku_snapshot}</p><dl className="grid gap-4 sm:grid-cols-2">{[["Jumlah", `${item.quantity} ${item.unit_name_snapshot}`], ["Batch", item.batch_number], ["Kedaluwarsa", item.expired_date], ["Harga Modal", formatInvoiceAmount(item.cost_price)], ["Pajak / Margin", `${item.tax_rate}% / ${item.margin_percent === null ? "Belum dapat dihitung" : `${Number(item.margin_percent.toFixed(2))}%`}`], ["Harga Jual", formatInvoiceAmount(item.selling_price)], ["Subtotal termasuk pajak", formatInvoiceAmount(item.subtotal ?? Number(itemSubtotalCents(String(item.cost_price), String(item.quantity), String(item.tax_rate))) / 100)]].map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl><div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={locked} onClick={() => void edit(item)}>Edit Barang</Button><Button type="button" variant="danger" disabled={locked || editing?.id === item.id} onClick={() => void remove(item)}>Hapus</Button></div></CardContent></Card>)}</section>
      <FinalizeReceivingButton invoiceId={invoice.id} disabled={locked || dirty || headerWorking || !items.length} />
    </div>
    <Modal open={headerOpen} keepMounted labelledBy="active-invoice-title" onClose={() => { if (!headerWorking) setHeaderOpen(false); }}><ModalHeader id="active-invoice-title" onClose={() => { if (!headerWorking) setHeaderOpen(false); }}>Invoice Aktif · Draft</ModalHeader><ModalContent><InvoiceForm key={invoice.version} invoice={invoice} onSaved={headerSaved} onWorkingChange={setHeaderWorking} /></ModalContent></Modal>
  </div>;
}
