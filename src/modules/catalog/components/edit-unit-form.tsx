"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, Input, Label } from "@/modules/ui/components";

export function EditUnitForm({ productId, unit }: { productId: string; unit: { id: string; name: string; conversion: number; price: number; barcode: string | null; base: boolean } }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(form: FormData) {
    if (busy) return; setBusy(true); setError("");
    const text = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
    const payload = unit.base ? { selling_price: Number(text("selling_price")), barcode: text("barcode") || null } : { unit_name: text("unit_name"), conversion_to_base: Number(text("conversion_to_base")), selling_price: Number(text("selling_price")), barcode: text("barcode") || null };
    try { const response = await fetch(`/api/products/${productId}/units/${unit.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json() as { ok: boolean }; if (!response.ok || !body.ok) { setError("Unit gagal diperbarui."); return; } router.push(`/products/${productId}`); } catch { setError("Unit gagal diperbarui."); } finally { setBusy(false); }
  }
  return <form action={submit} className="mt-5"><Card><CardHeader><h2 className="font-semibold">Informasi Unit Penjualan</h2></CardHeader><CardContent className="grid gap-4"><FormField><Label htmlFor="unit_name">Nama Unit</Label><Input id="unit_name" name="unit_name" defaultValue={unit.name} readOnly={unit.base} /></FormField><FormField><Label htmlFor="conversion_to_base">Konversi ke Unit Dasar</Label><Input id="conversion_to_base" name="conversion_to_base" type="number" defaultValue={unit.conversion} readOnly={unit.base} /></FormField><FormField><Label htmlFor="selling_price">Harga Jual</Label><Input id="selling_price" name="selling_price" type="number" min="0" defaultValue={unit.price} /></FormField><FormField><Label htmlFor="barcode">Barcode</Label><Input id="barcode" name="barcode" defaultValue={unit.barcode ?? ""} inputMode="numeric" /></FormField>{unit.base ? <p className="text-sm text-[var(--text-muted)]">Unit dasar tidak dapat diubah dari halaman ini.</p> : null}{error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Unit"}</Button></FormActions></CardContent></Card></form>;
}
