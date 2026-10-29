"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, Checkbox, FormActions, FormField, FormSection, Input, Label, Select, Textarea } from "@/modules/ui/components";

type Master = { categories: { id: string; name: string }[]; subcategories: { id: string; category_id: string; name: string }[]; suppliers: { id: string; name: string }[]; locations: { id: string; full_code: string }[]; taxes: { id: string; name: string; rate: number }[] };

export function EditProductForm({ id, product, master }: { id: string; product: Record<string, unknown>; master: Master }) {
  const router = useRouter();
  const [category, setCategory] = useState(String(product.categoryId ?? ""));
  const [subcategory, setSubcategory] = useState(String(product.subcategoryId ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const subs = useMemo(() => master.subcategories.filter((item) => item.category_id === category), [category, master]);
  const changeCategory = (value: string) => { setCategory(value); if (!master.subcategories.some((item) => item.id === subcategory && item.category_id === value)) setSubcategory(""); };

  async function submit(form: FormData) {
    if (busy) return;
    setBusy(true); setError("");
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const taxRate = Number(form.get("tax_rate"));
    const payload = { sku: text("sku"), name: text("name"), generic_name: text("generic_name"), description: text("description"), manufacturer: text("manufacturer"), category_id: category, subcategory_id: subcategory, storage_location_id: text("storage_location_id"), default_supplier_id: text("default_supplier_id"), cost_price: text("cost_price") === "" ? null : Number(form.get("cost_price")), tax_rate: taxRate, is_taxable: taxRate > 0, drug_classification: text("drug_classification"), minimum_stock: Number(form.get("minimum_stock")) };
    try {
      const response = await fetch(`/api/products/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError("Produk gagal diperbarui."); return; }
      router.push(`/products/${id}`);
    } catch { setError("Produk gagal diperbarui."); } finally { setBusy(false); }
  }

  return <form action={submit} className="mt-5"><Card><CardHeader><h2 className="font-semibold">Informasi Produk</h2></CardHeader><CardContent className="grid gap-8">
    <FormSection title="Informasi Dasar"><FormField><Label htmlFor="sku">SKU</Label><Input id="sku" name="sku" defaultValue={String(product.sku ?? "")} /></FormField><FormField><Label htmlFor="name">Nama Produk</Label><Input id="name" name="name" defaultValue={String(product.name ?? "")} /></FormField><FormField><Label htmlFor="generic_name">Nama Generik</Label><Input id="generic_name" name="generic_name" defaultValue={String(product.genericName ?? "")} /></FormField><FormField><Label htmlFor="manufacturer">Produsen</Label><Input id="manufacturer" name="manufacturer" defaultValue={String(product.manufacturer ?? "")} /></FormField><FormField className="md:col-span-2"><Label htmlFor="description">Deskripsi</Label><Textarea id="description" name="description" defaultValue={String(product.description ?? "")} /></FormField></FormSection>
    <FormSection title="Klasifikasi"><FormField><Label htmlFor="category">Kategori</Label><Select id="category" value={category} onChange={(event) => changeCategory(event.target.value)}><option value="">Kategori</option>{master.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField><FormField><Label htmlFor="subcategory">Subkategori</Label><Select id="subcategory" value={subcategory} onChange={(event) => setSubcategory(event.target.value)}><option value="">Subkategori</option>{subs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField><FormField><Label htmlFor="drug_classification">Klasifikasi Obat</Label><Select id="drug_classification" name="drug_classification" defaultValue={String(product.drugClassification ?? "otc")}><option value="otc">Bebas</option><option value="otc_limited">Bebas terbatas</option><option value="prescription_required">Wajib resep</option></Select></FormField></FormSection>
    <FormSection title="Pengaturan Persediaan"><FormField><Label htmlFor="cost_price">Harga Modal</Label><Input id="cost_price" name="cost_price" type="number" min="0" defaultValue={String(product.costPrice ?? "")} /></FormField><FormField><Label htmlFor="tax_rate">Pajak</Label><Select id="tax_rate" name="tax_rate" defaultValue={String(product.taxRate ?? 0)}>{!master.taxes.some((tax) => String(tax.rate) === String(product.taxRate ?? 0)) ? <option value={String(product.taxRate ?? 0)}>Pajak historis — {String(product.taxRate ?? 0)}%</option> : null}{master.taxes.map((tax) => <option key={tax.id} value={tax.rate}>{tax.name} — {tax.rate}%</option>)}</Select></FormField><FormField><Label htmlFor="minimum_stock">Minimum Stok</Label><Input id="minimum_stock" name="minimum_stock" type="number" min="0" defaultValue={String(product.minimumStock ?? 0)} /></FormField><FormField><Label htmlFor="default_supplier_id">Pemasok Utama</Label><Select id="default_supplier_id" name="default_supplier_id" defaultValue={String(product.defaultSupplierId ?? "")}><option value="">Belum ditentukan</option>{master.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField><FormField><Label htmlFor="storage_location_id">Lokasi Penyimpanan</Label><Select id="storage_location_id" name="storage_location_id" defaultValue={String(product.storageLocationId ?? "")}><option value="">Belum ditentukan</option>{master.locations.map((item) => <option key={item.id} value={item.id}>{item.full_code}</option>)}</Select></FormField><Checkbox name="is_taxable" defaultChecked={Boolean(product.isTaxable)} label="Kena Pajak" /></FormSection>
    <p className="text-sm text-[var(--text-muted)]">Unit dasar: {String(product.baseUnit ?? "")}</p>{error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Produk"}</Button></FormActions>
  </CardContent></Card></form>;
}
