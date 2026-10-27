"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField, Input, Label } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";

// Reuses the existing exact-barcode read API; the list search/query stays intact.
export function ProductBarcodeLookup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const close = () => { if (!inFlight.current) setOpen(false); };

  async function lookup() {
    if (!barcode.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/products?${new URLSearchParams({ barcode: barcode.trim() })}`, { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; data?: { inactive?: boolean; product?: { id?: string } } | null };
      if (!response.ok || !body.ok) { setError("Pencarian belum berhasil. Silakan coba lagi."); return; }
      if (!body.data) { setError("Barcode tidak ditemukan. Periksa kembali angkanya."); return; }
      if (body.data.inactive) { setError("Barang ini nonaktif. Cari melalui nama atau SKU dengan pilihan status Nonaktif."); return; }
      const id = body.data.product?.id;
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) { setError("Barang belum dapat dibuka. Silakan coba lagi."); return; }
      setOpen(false);
      router.push(`/products/${id}`);
    } catch { setError("Pencarian belum berhasil. Periksa koneksi Anda."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <>
    <Button type="button" variant="secondary" onClick={() => { setError(""); setOpen(true); }}>Cari Barcode</Button>
    <Modal open={open} labelledBy="product-barcode-title" onClose={close}>
      <form onSubmit={event => { event.preventDefault(); void lookup(); }}>
        <ModalHeader id="product-barcode-title" onClose={close}>Cari Barang dengan Barcode</ModalHeader>
        <ModalContent><FormField><Label htmlFor="product-barcode">Barcode</Label><Input id="product-barcode" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Pindai atau ketik barcode" required maxLength={128} autoFocus disabled={busy} autoComplete="off" aria-describedby={error ? "product-barcode-error" : undefined} error={Boolean(error)} /></FormField>{error ? <p id="product-barcode-error" role="alert" className="mt-4 text-base text-red-800">{error}</p> : null}</ModalContent>
        <ModalFooter><Button type="button" variant="secondary" onClick={close} disabled={busy}>Kembali</Button><Button type="submit" disabled={busy || !barcode.trim()}>{busy ? "Mencari..." : "Buka Barang"}</Button></ModalFooter>
      </form>
    </Modal>
  </>;
}
