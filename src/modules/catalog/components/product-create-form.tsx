"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormActions, FormField, FormSection, Input, Label, Select, Textarea } from "@/modules/ui/components";
import { createMasterProductRequest } from "../master-product-input";

type Option = { id: string; name: string };
type Subcategory = Option & { category_id: string };
type ProductCreateFormProps = { categories: Option[]; subcategories: Subcategory[]; suppliers: Option[] };

export function ProductCreateForm({ categories, subcategories, suppliers }: ProductCreateFormProps) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(""); const [subcategoryId, setSubcategoryId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const availableSubcategories = useMemo(() => subcategories.filter((subcategory) => subcategory.category_id === categoryId), [categoryId, subcategories]);

  function changeCategory(value: string) { setCategoryId(value); if (!subcategories.some((subcategory) => subcategory.id === subcategoryId && subcategory.category_id === value)) setSubcategoryId(""); }

  async function submit(form: FormData) {
    if (busy) return;
    setBusy(true); setError("");
    const payload = createMasterProductRequest(form, categoryId, subcategoryId);
    try {
      const response = await fetch("/api/products/master", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json()) as { ok: boolean; data?: { product_id: string }; error?: { code: string } };
      if (!response.ok || !body.ok) {
        const messages: Record<string, string> = { DUPLICATE_SKU: "SKU sudah digunakan oleh produk lain.", INVALID_CATEGORY_SUBCATEGORY: "Kombinasi kategori dan subkategori tidak valid.", INVALID_SUPPLIER: "Pemasok tidak tersedia. Pilih pemasok lain." };
        setError(messages[body.error?.code ?? ""] ?? "Produk gagal disimpan. Periksa data lalu coba lagi.");
        return;
      }
      router.push(`/products/${body.data?.product_id}`);
    } catch { setError("Produk gagal disimpan. Periksa data lalu coba lagi."); } finally { setBusy(false); }
  }

  return <form onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="grid gap-6"><Card><CardHeader><h2 className="text-lg font-semibold">Informasi Produk</h2><p className="mt-1 text-base text-[var(--text-muted)]">Simpan data master terlebih dahulu. Produk belum memiliki stok atau harga jual dan belum dapat dijual.</p></CardHeader><CardContent className="grid gap-8">
    <FormSection title="Informasi Dasar"><FormField><Label htmlFor="sku">SKU</Label><Input id="sku" name="sku" required placeholder="Contoh: OB-001" /></FormField><FormField><Label htmlFor="name">Nama Produk</Label><Input id="name" name="name" required placeholder="Nama produk" /></FormField><FormField><Label htmlFor="manufacturer">Produsen</Label><Input id="manufacturer" name="manufacturer" placeholder="Opsional" /></FormField><FormField className="md:col-span-2"><Label htmlFor="description">Deskripsi</Label><Textarea id="description" name="description" placeholder="Opsional" /></FormField></FormSection>
    <FormSection title="Klasifikasi"><FormField><Label htmlFor="category_id">Kategori</Label><Select id="category_id" required value={categoryId} onChange={(event) => changeCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></FormField><FormField><Label htmlFor="subcategory_id">Subkategori</Label><Select id="subcategory_id" required disabled={!categoryId} value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">Pilih subkategori</option>{availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</Select></FormField><FormField><Label htmlFor="drug_classification">Klasifikasi Obat</Label><Select id="drug_classification" name="drug_classification" defaultValue="otc"><option value="otc">Bebas</option><option value="otc_limited">Bebas terbatas</option><option value="prescription_required">Wajib resep</option></Select></FormField><FormField><Label htmlFor="base_unit">Unit Dasar</Label><Input id="base_unit" name="base_unit" required placeholder="Contoh: Tablet" /></FormField></FormSection>
    <FormSection title="Pengaturan Persediaan"><FormField><Label htmlFor="minimum_stock">Minimum Stok</Label><Input id="minimum_stock" name="minimum_stock" required type="number" min="0" max="2147483647" step="1" defaultValue="5" /><p className="text-base text-[var(--text-muted)]">Batas pengingat stok dalam unit dasar.</p></FormField></FormSection>
    <FormSection title="Informasi Tambahan"><FormField><Label htmlFor="default_supplier_id">Pemasok Utama (opsional)</Label><Select id="default_supplier_id" name="default_supplier_id"><option value="">Belum ditentukan</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></FormField></FormSection>
    {error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-base text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="button" variant="secondary" onClick={() => router.push("/products")} disabled={busy}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Produk"}</Button></FormActions>
  </CardContent></Card></form>;
}
