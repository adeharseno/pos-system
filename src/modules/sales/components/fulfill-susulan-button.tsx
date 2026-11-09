"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/modules/ui/icons";

interface CashierProductItem {
  id: string;
  name: string;
  sku: string;
  availableBaseStock: number;
  baseUnit: string;
}

export function FulfillSusulanButton({
  transactionId,
  susulanId,
  drugName,
  quantity,
}: {
  transactionId: string;
  susulanId: string;
  drugName: string;
  quantity: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(drugName);
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState<CashierProductItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CashierProductItem | null>(null);

  // Auto search matching products when modal opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    const fetchProducts = async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const body = await res.json();
        if (active && body.ok && Array.isArray(body.data)) {
          const mapped: CashierProductItem[] = (body.data as Record<string, unknown>[]).map((p) => ({
            id: String(p.id),
            name: String(p.name),
            sku: String(p.sku),
            availableBaseStock: typeof p.availableBaseStock === "number" ? p.availableBaseStock : 0,
            baseUnit: typeof p.baseUnit === "string" ? p.baseUnit : "unit",
          }));
          setProducts(mapped);
          if (mapped.length > 0) {
            const exact = mapped.find((p) => p.name.toLowerCase() === drugName.toLowerCase());
            setSelectedProduct((prev) => prev ?? (exact ?? mapped[0]));
          }
        }
      } catch {
        // ignore
      } finally {
        if (active) setSearching(false);
      }
    };
    fetchProducts();
    return () => {
      active = false;
    };
  }, [open, query, drugName]);

  async function handleConfirm() {
    if (selectedProduct && selectedProduct.availableBaseStock < quantity) {
      setError(`Stok tidak mencukupi (tersedia: ${selectedProduct.availableBaseStock}, dibutuhkan: ${quantity})`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/susulan/${susulanId}/fulfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProduct?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error?.code === "INSUFFICIENT_STOCK") {
          setError("Stok produk tidak mencukupi untuk memenuhi pesanan ini.");
        } else {
          setError(data.error?.message ?? "Gagal memproses penyerahan barang.");
        }
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const isStockInsufficient = selectedProduct ? selectedProduct.availableBaseStock < quantity : false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none"
      >
        Sudah Diserahkan
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4">
          <button
            type="button"
            aria-label="Tutup konfirmasi"
            className="absolute inset-0 bg-zinc-950/40"
            onClick={() => !loading && setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="fulfill-title"
            className="relative flex w-full max-w-[500px] flex-col rounded-xl bg-white p-6 shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Penyerahan Produk Susulan</p>
                <h3 id="fulfill-title" className="text-lg font-bold text-gray-900">
                  Konfirmasi Penyerahan Fisik
                </h3>
              </div>
              <button
                type="button"
                aria-label="Tutup"
                disabled={loading}
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded hover:bg-gray-100"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-lg bg-gray-50 p-3.5">
                <p className="font-semibold text-gray-900">{drugName}</p>
                <p className="mt-1 text-gray-600">
                  Jumlah yang diserahkan: <strong className="font-semibold text-gray-900">{quantity} unit</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Hubungkan dengan Master Barang (Potong Stok)
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari master barang..."
                    className="h-10 w-full rounded border border-gray-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
                {searching ? <p className="mt-1 text-xs text-gray-500">Mencari stok barang...</p> : null}
              </div>

              {products.length > 0 ? (
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 rounded border border-gray-200">
                  {products.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    const insufficient = p.availableBaseStock < quantity;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProduct(p)}
                        className={`flex w-full items-center justify-between p-2.5 text-left text-xs transition-colors ${
                          isSelected ? "bg-brand-50 text-brand-900 font-semibold" : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div>
                          <p>{p.name}</p>
                          <p className="text-[11px] text-gray-500">SKU: {p.sku}</p>
                        </div>
                        <span className={`tabular font-medium ${insufficient ? "text-red-600" : "text-emerald-700"}`}>
                          Stok: {p.availableBaseStock} {p.baseUnit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : !searching ? (
                <p className="text-xs text-gray-500">
                  Tidak ditemukan produk di master barang dengan kata kunci ini. Penyerahan dapat dilakukan tanpa memotong master barang jika stok belum terdata di sistem.
                </p>
              ) : null}

              {selectedProduct ? (
                <div className={`rounded-lg p-3 text-xs ${isStockInsufficient ? "bg-red-50 text-red-800 border border-red-200" : "bg-emerald-50 text-emerald-900 border border-emerald-200"}`}>
                  <p>
                    Barang yang akan dipotong stok: <strong>{selectedProduct.name}</strong>
                  </p>
                  <p className="mt-0.5">
                    Stok tersedia: <strong>{selectedProduct.availableBaseStock}</strong> {selectedProduct.baseUnit} · Akan dipotong: <strong>{quantity}</strong>
                  </p>
                  {isStockInsufficient ? <p className="mt-1 font-semibold text-red-700">Stok barang di sistem tidak mencukupi untuk penyerahan ini.</p> : null}
                </div>
              ) : null}

              {error ? (
                <p role="alert" className="rounded bg-red-50 p-2.5 text-xs font-medium text-red-700">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                disabled={loading}
                onClick={() => setOpen(false)}
                className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={loading || isStockInsufficient}
                onClick={handleConfirm}
                className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Memproses…" : "Konfirmasi Sudah Diserahkan"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
