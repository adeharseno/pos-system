"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, FormSection, Input, Label, Select } from "@/modules/ui/components";

type Product = { id: string; sku: string; name: string; base_unit: string; cost_price: number; current_stock: number };
type Batch = { batch_number: string; expired_date: string; quantity: string; cost_price: string; received_date: string };

const emptyBatch = (): Batch => ({ batch_number: "", expired_date: "", quantity: "", cost_price: "", received_date: "" });
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf());
const messages: Record<string, string> = { DUPLICATE_BATCH: "Batch dengan tanggal kedaluwarsa tersebut sudah tersedia.", EXPIRED_BATCH: "Batch sudah kedaluwarsa.", INVALID_EXPIRY: "Tanggal kedaluwarsa tidak valid.", PRODUCT_INACTIVE: "Produk tidak aktif.", STOCK_OPNAME_IN_PROGRESS: "Stock opname sedang berlangsung.", INVALID_QUANTITY: "Jumlah harus berupa bilangan bulat lebih dari 0.", INVALID_COST: "Harga modal tidak valid." };
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function ReceiveStockForm({ products, initialProductId = "" }: { products: Product[]; initialProductId?: string }) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId);
  const [batches, setBatches] = useState<Batch[]>([emptyBatch()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const product = products.find((item) => item.id === productId);
  const update = (index: number, key: keyof Batch, value: string) => setBatches((current) => current.map((batch, itemIndex) => itemIndex === index ? { ...batch, [key]: value } : batch));

  function validate() {
    if (!productId) return "Pilih produk terlebih dahulu.";
    for (const batch of batches) {
      if (!batch.batch_number.trim()) return "Nomor batch wajib diisi.";
      const quantity = Number(batch.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) return "Jumlah harus berupa bilangan bulat lebih dari 0.";
      const cost = Number(batch.cost_price);
      if (!Number.isFinite(cost) || cost < 0) return "Harga modal tidak valid.";
      if (!dateValid(batch.expired_date) || (batch.received_date && !dateValid(batch.received_date))) return "Tanggal tidak valid.";
    }
    return "";
  }

  async function submit() {
    if (busy) return;
    const validation = validate();
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/inventory/receive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product_id: productId, batches: batches.map((batch) => ({ batch_number: batch.batch_number.trim(), expired_date: batch.expired_date, quantity: Number(batch.quantity), cost_price: Number(batch.cost_price), ...(batch.received_date ? { received_date: batch.received_date } : {}) })) }) });
      const body = await response.json() as { ok: boolean; error?: { code?: string; message?: string } };
      if (!response.ok || !body.ok) { setError(messages[body.error?.code ?? ""] ?? body.error?.message ?? "Stok gagal diterima."); return; }
      router.push(`/products/${productId}`); router.refresh();
    } catch { setError("Stok gagal diterima."); } finally { setBusy(false); }
  }

  return <section className="mt-6 grid gap-6">
    <Card><CardHeader><h2 className="text-lg font-semibold">Produk</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Pilih produk yang akan menerima stok.</p></CardHeader><CardContent className="grid gap-5">
      <FormField><Label htmlFor="product_id">Produk</Label><Select id="product_id" value={productId} onChange={(event) => setProductId(event.target.value)} disabled={busy}><option value="">Pilih produk</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</Select></FormField>
      {product ? <Card className="bg-[var(--surface-subtle)] shadow-none"><CardContent className="grid gap-4 sm:grid-cols-2"><div><p className="text-sm text-[var(--text-muted)]">Nama Produk</p><p className="font-medium">{product.name}</p></div><div><p className="text-sm text-[var(--text-muted)]">SKU</p><p className="font-medium">{product.sku}</p></div><div><p className="text-sm text-[var(--text-muted)]">Unit Dasar</p><p className="font-medium">{product.base_unit}</p></div><div><p className="text-sm text-[var(--text-muted)]">Stok Saat Ini</p><p className="font-medium">{product.current_stock} {product.base_unit}</p></div><div className="sm:col-span-2"><p className="text-sm text-[var(--text-muted)]">Harga Modal Saat Ini</p><p className="font-medium">{rupiah(product.cost_price)}</p></div></CardContent></Card> : null}
    </CardContent></Card>

    <FormSection title="Batch" description="Quantity menggunakan Unit Dasar produk."><div className="md:col-span-2 grid gap-4">
      {product ? <p className="text-sm text-[var(--text-muted)]">Unit Dasar: <strong>{product.base_unit}</strong> → Quantity 100 = 100 {product.base_unit.toLowerCase()}</p> : null}
      {batches.map((batch, index) => <Card key={index}><CardHeader className="flex items-center justify-between gap-3"><h3 className="font-semibold">Batch {index + 1}</h3>{batches.length > 1 ? <Button type="button" variant="secondary" onClick={() => setBatches((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={busy}>Hapus Batch</Button> : null}</CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><FormField><Label htmlFor={`batch-number-${index}`}>Batch Number</Label><Input id={`batch-number-${index}`} value={batch.batch_number} onChange={(event) => update(index, "batch_number", event.target.value)} placeholder="Batch Number" disabled={busy} /></FormField><FormField><Label htmlFor={`expired-date-${index}`}>Expired Date</Label><Input id={`expired-date-${index}`} value={batch.expired_date} onChange={(event) => update(index, "expired_date", event.target.value)} type="date" disabled={busy} /></FormField><FormField><Label htmlFor={`quantity-${index}`}>Quantity</Label><Input id={`quantity-${index}`} value={batch.quantity} onChange={(event) => update(index, "quantity", event.target.value)} type="number" min="1" step="1" placeholder="Quantity" disabled={busy} /></FormField><FormField><Label htmlFor={`cost-price-${index}`}>Cost Price</Label><Input id={`cost-price-${index}`} value={batch.cost_price} onChange={(event) => update(index, "cost_price", event.target.value)} type="number" min="0" step="any" placeholder="Cost Price" disabled={busy} /></FormField><FormField><Label htmlFor={`received-date-${index}`}>Received Date</Label><Input id={`received-date-${index}`} value={batch.received_date} onChange={(event) => update(index, "received_date", event.target.value)} type="date" disabled={busy} /><p className="text-sm text-[var(--text-muted)]">Received Date opsional</p></FormField></CardContent></Card>)}
    </div></FormSection>

    <div><Button type="button" variant="secondary" onClick={() => setBatches((current) => [...current, emptyBatch()])} disabled={busy}>+ Tambah Batch</Button></div>
    {error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
    <FormActions><Button type="button" variant="secondary" onClick={() => router.back()} disabled={busy}>Batal</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Terima Stok"}</Button></FormActions>
  </section>;
}
