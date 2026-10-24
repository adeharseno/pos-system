"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label } from "@/modules/ui/components";

export function AddUnitForm({ productId }: { productId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(form: FormData) {
    if (busy) return; setBusy(true); setError("");
    const text = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
    const payload = { unit_name: text("unit_name"), conversion_to_base: Number(text("conversion_to_base")), selling_price: Number(text("selling_price")), barcode: text("barcode") || null };
    try { const response = await fetch(`/api/products/${productId}/units`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json() as { ok: boolean; error?: { code: string } }; if (!response.ok || !body.ok) { const messages: Record<string, string> = { DUPLICATE_UNIT_NAME: "Nama unit sudah digunakan pada produk ini.", DUPLICATE_BARCODE: "Barcode sudah digunakan oleh unit produk lain.", INVALID_CONVERSION: "Konversi unit harus berupa bilangan bulat lebih dari 0.", INVALID_SELLING_PRICE: "Harga jual tidak valid.", PRODUCT_NOT_FOUND: "Produk tidak ditemukan." }; setError(messages[body.error?.code ?? ""] ?? "Unit gagal disimpan."); return; } router.push(`/products/${productId}`); } catch { setError("Unit gagal disimpan."); } finally { setBusy(false); }
  }
  return <form action={submit} className="mt-5"><Card><CardHeader><h2 className="font-semibold">Informasi Unit Penjualan</h2></CardHeader><CardContent className="grid gap-4"><FormField><Label htmlFor="unit_name">Nama Unit</Label><Input id="unit_name" required name="unit_name" /></FormField><FormField><Label htmlFor="conversion_to_base">Konversi ke Unit Dasar</Label><Input id="conversion_to_base" required min="1" step="1" type="number" name="conversion_to_base" /></FormField><FormField><Label htmlFor="selling_price">Harga Jual</Label><Input id="selling_price" required min="0" type="number" name="selling_price" /></FormField><FormField><Label htmlFor="barcode">Barcode</Label><Input id="barcode" name="barcode" placeholder="Opsional" inputMode="numeric" /></FormField>{error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Unit"}</Button></FormActions></CardContent></Card></form>;
}
