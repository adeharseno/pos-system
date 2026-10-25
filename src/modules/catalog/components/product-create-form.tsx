"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, Checkbox, FormActions, FormField, FormSection, Input, Label, Select, Textarea } from "@/modules/ui/components";
import { formatMarginPercent, marginFromSellingPrice, sellingPriceFromCost } from "../product-pricing";
import { createProductRequest } from "../product-create-request";

type Option = { id: string; name: string };
type Subcategory = Option & { category_id: string };
type ProductCreateFormProps = { categories: Option[]; subcategories: Subcategory[]; suppliers: Option[]; locations: { id: string; full_code: string }[]; taxes: { id: string; name: string; rate: number }[] };

function numeric(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProductCreateForm({ categories, subcategories, suppliers, locations, taxes }: ProductCreateFormProps) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(""); const [subcategoryId, setSubcategoryId] = useState("");
  const [costPrice, setCostPrice] = useState(""); const [taxRate, setTaxRate] = useState(() => String(taxes.find((tax) => tax.rate === 0)?.rate ?? taxes[0]?.rate ?? 0)); const [margin, setMargin] = useState("0"); const [sellingPrice, setSellingPrice] = useState("");
  const [addInitialStock, setAddInitialStock] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const availableSubcategories = useMemo(() => subcategories.filter((subcategory) => subcategory.category_id === categoryId), [categoryId, subcategories]);

  function recalculateSelling(nextCost: string, nextTax: string, nextMargin: string) {
    const result = sellingPriceFromCost(numeric(nextCost) ?? Number.NaN, numeric(nextTax) ?? Number.NaN, numeric(nextMargin) ?? Number.NaN);
    if (result !== null) setSellingPrice(String(result));
  }
  function changeCategory(value: string) { setCategoryId(value); if (!subcategories.some((subcategory) => subcategory.id === subcategoryId && subcategory.category_id === value)) setSubcategoryId(""); }
  function changeCost(value: string) { setCostPrice(value); recalculateSelling(value, taxRate, margin); }
  function changeTax(value: string) { setTaxRate(value); recalculateSelling(costPrice, value, margin); }
  function changeMargin(value: string) { setMargin(value); recalculateSelling(costPrice, taxRate, value); }
  function changeSelling(value: string) { setSellingPrice(value); const result = marginFromSellingPrice(numeric(costPrice) ?? Number.NaN, numeric(taxRate) ?? Number.NaN, numeric(value) ?? Number.NaN); if (result !== null) setMargin(formatMarginPercent(result)); }
  function toggleInitialStock(checked: boolean) { setAddInitialStock(checked); }
  function changeActive(checked: boolean) {
    setIsActive(checked);
    if (!checked) setAddInitialStock(false);
  }

  async function submit(form: FormData) {
    if (busy) return;
    setBusy(true); setError("");
    const payload = createProductRequest(form, categoryId, subcategoryId);
    try {
      const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await response.json()) as { ok: boolean; data?: { product_id: string }; error?: { code: string } };
      if (!response.ok || !body.ok) {
        const messages: Record<string, string> = { DUPLICATE_SKU: "SKU sudah digunakan oleh produk lain.", DUPLICATE_BARCODE: "Barcode sudah digunakan oleh unit produk lain.", INVALID_CATEGORY_SUBCATEGORY: "Kombinasi kategori dan subkategori tidak valid.", INVALID_BATCH: "Data stok awal tidak valid.", EXPIRED_BATCH: "Tanggal kedaluwarsa stok awal tidak valid.", STOCK_OPNAME_IN_PROGRESS: "Stok awal tidak dapat ditambahkan saat perhitungan stok berlangsung.", PRODUCT_INACTIVE: "Produk tidak aktif sehingga stok awal tidak dapat ditambahkan." };
        setError(messages[body.error?.code ?? ""] ?? "Produk gagal disimpan. Periksa data lalu coba lagi.");
        return;
      }
      router.push(`/products/${body.data?.product_id}`);
    } catch { setError("Produk gagal disimpan. Periksa data lalu coba lagi."); } finally { setBusy(false); }
  }

  return <form onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="grid gap-6"><Card><CardHeader><h2 className="text-lg font-semibold">Informasi Produk</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Lengkapi data produk dan unit penjualan dasar yang akan dibuat.</p></CardHeader><CardContent className="grid gap-8">
    <FormSection title="Informasi Dasar"><FormField><Label htmlFor="sku">SKU</Label><Input id="sku" name="sku" required placeholder="Contoh: OB-001" /></FormField><FormField><Label htmlFor="name">Nama Produk</Label><Input id="name" name="name" required placeholder="Nama produk" /></FormField><FormField><Label htmlFor="manufacturer">Produsen</Label><Input id="manufacturer" name="manufacturer" placeholder="Opsional" /></FormField><FormField className="md:col-span-2"><Label htmlFor="description">Deskripsi</Label><Textarea id="description" name="description" placeholder="Opsional" /></FormField></FormSection>
    <FormSection title="Klasifikasi"><FormField><Label htmlFor="category_id">Kategori</Label><Select id="category_id" required value={categoryId} onChange={(event) => changeCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></FormField><FormField><Label htmlFor="subcategory_id">Subkategori</Label><Select id="subcategory_id" required disabled={!categoryId} value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">Pilih subkategori</option>{availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</Select></FormField><FormField><Label htmlFor="drug_classification">Klasifikasi Obat</Label><Select id="drug_classification" name="drug_classification" defaultValue="otc"><option value="otc">Bebas</option><option value="otc_limited">Bebas terbatas</option><option value="prescription_required">Wajib resep</option></Select></FormField><FormField><Label htmlFor="base_unit">Unit Dasar</Label><Input id="base_unit" name="base_unit" required placeholder="Contoh: Tablet" /></FormField></FormSection>
    <FormSection title="Harga"><FormField><Label htmlFor="cost_price">Harga Modal</Label><Input id="cost_price" name="cost_price" required type="number" min="0" step="1" value={costPrice} onChange={(event) => changeCost(event.target.value)} placeholder="0" /></FormField><FormField><Label htmlFor="tax_rate">Pajak (%)</Label><Select id="tax_rate" name="tax_rate" value={taxRate} onChange={(event) => changeTax(event.target.value)}>{taxes.map((tax) => <option key={tax.id} value={tax.rate}>{tax.name} — {tax.rate}%</option>)}</Select></FormField><FormField><Label htmlFor="margin">Margin (%)</Label><Input id="margin" type="number" min="0" value={margin} onChange={(event) => changeMargin(event.target.value)} /></FormField><FormField><Label htmlFor="selling_price">Harga Jual</Label><Input id="selling_price" name="selling_price" required type="number" min="0" step="1" value={sellingPrice} onChange={(event) => changeSelling(event.target.value)} placeholder="0" /></FormField></FormSection>
    <FormSection title="Pengaturan Persediaan"><FormField><Label htmlFor="minimum_stock">Minimum Stok</Label><Input id="minimum_stock" name="minimum_stock" type="number" min="0" defaultValue="0" /></FormField><FormField><Label htmlFor="storage_location_id">Lokasi Penyimpanan</Label><Select id="storage_location_id" name="storage_location_id"><option value="">Belum ditentukan</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.full_code}</option>)}</Select></FormField><Checkbox name="is_taxable" label="Kena Pajak" /></FormSection>
    <FormSection title="Stok Awal" description="Jumlah menggunakan unit dasar produk."><Checkbox name="add_initial_stock" checked={addInitialStock} disabled={!isActive} onChange={(event) => toggleInitialStock(event.target.checked)} label="Tambahkan stok awal" />{addInitialStock && !isActive ? <p className="text-sm text-[var(--danger)]" role="alert">Produk tidak aktif sehingga stok awal tidak dapat ditambahkan.</p> : null}{addInitialStock ? <><FormField><Label htmlFor="initial_quantity">Jumlah</Label><Input id="initial_quantity" name="initial_quantity" required type="number" min="1" step="1" placeholder="Contoh: 100" /><p className="text-sm text-[var(--text-muted)]">Stok awal dihitung dalam Unit Dasar yang dipilih.</p></FormField><FormField><Label htmlFor="initial_expired_date">Tanggal Kedaluwarsa</Label><Input id="initial_expired_date" name="initial_expired_date" required type="date" /></FormField></> : null}</FormSection>
    <FormSection title="Informasi Tambahan"><FormField><Label htmlFor="default_supplier_id">Pemasok Utama</Label><Select id="default_supplier_id" name="default_supplier_id"><option value="">Belum ditentukan</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></FormField><FormField><Label htmlFor="barcode">Barcode</Label><Input id="barcode" name="barcode" inputMode="numeric" placeholder="Opsional" /></FormField><Checkbox name="is_active" checked={isActive} onChange={(event) => changeActive(event.target.checked)} label="Aktif" /></FormSection>
    {error ? <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}<FormActions><Button type="button" variant="secondary" onClick={() => router.push("/products")} disabled={busy}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Produk"}</Button></FormActions>
  </CardContent></Card></form>;
}
