"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, FormField, Input, Label, Textarea } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
type Supplier = { id: string; name: string; phone: string | null; address: string | null };
type Draft = { id?: string; name: string; phone: string; address: string };
export function SupplierManagement({ rows }: { rows: Supplier[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const close = () => { if (!busy) { setDraft(null); setError(""); } };
  async function request(method: string, id?: string, data?: Draft) {
    const response = await fetch("/api/suppliers" + (id ? "/" + id : ""), { method, headers: { "content-type": "application/json" }, body: data ? JSON.stringify({ name: data.name, phone: data.phone, address: data.address }) : undefined });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Data pemasok belum dapat disimpan. Silakan coba lagi.");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await request(draft.id ? "PATCH" : "POST", draft.id, draft); setDraft(null); setNotice("Pemasok berhasil disimpan."); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Pemasok gagal disimpan."); }
    finally { setBusy(false); }
  }
  async function remove(row: Supplier) {
    if (busy || !confirm('Hapus pemasok "' + row.name + '" dari daftar? Riwayat yang menggunakan pemasok ini tetap disimpan.')) return;
    setBusy(true); setError(""); setNotice("");
    try { await request("DELETE", row.id); setNotice("Pemasok berhasil dihapus dari daftar."); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Pemasok gagal dihapus."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <div className="flex justify-end"><Button disabled={busy} onClick={() => { setDraft({ name: "", phone: "", address: "" }); setError(""); setNotice(""); }}>Tambah Pemasok</Button></div>
    {notice ? <p role="status" className="text-base text-green-800">{notice}</p> : null}
    {error && !draft ? <p role="alert" className="text-base text-red-800">{error}</p> : null}
    <h2 className="text-xl font-semibold">Daftar Pemasok</h2>
    {!rows.length ? <Card><CardContent><p>Tidak ada pemasok. Tambahkan pemasok atau coba nama lain.</p></CardContent></Card> : <div className="grid gap-5 md:grid-cols-2">{rows.map(row => <Card key={row.id}><CardContent className="space-y-4 text-base"><h3 className="break-words text-lg font-semibold">{row.name}</h3><p className="break-words">Telepon: {row.phone || "Belum diisi"}</p><p className="whitespace-pre-wrap break-words">Alamat: {row.address || "Belum diisi"}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} aria-label={"Edit pemasok " + row.name} onClick={() => { setDraft({ id: row.id, name: row.name, phone: row.phone ?? "", address: row.address ?? "" }); setError(""); }}>Edit</Button><Button variant="danger" disabled={busy} aria-label={"Hapus pemasok " + row.name} onClick={() => remove(row)}>Hapus</Button></div></CardContent></Card>)}</div>}
    <Modal open={draft !== null} labelledBy="supplier-title" onClose={close}><ModalHeader id="supplier-title" onClose={close}>{draft?.id ? "Edit Pemasok" : "Tambah Pemasok"}</ModalHeader><form onSubmit={save}><ModalContent><fieldset disabled={busy} className="space-y-5">
      <FormField><Label htmlFor="supplier-name">Nama Pemasok (wajib)</Label><Input id="supplier-name" required maxLength={200} autoFocus value={draft?.name ?? ""} onChange={e => setDraft(d => d && { ...d, name: e.target.value })} /></FormField>
      <FormField><Label htmlFor="supplier-phone">Nomor Telepon (opsional)</Label><Input id="supplier-phone" type="tel" maxLength={50} value={draft?.phone ?? ""} onChange={e => setDraft(d => d && { ...d, phone: e.target.value })} /></FormField>
      <FormField><Label htmlFor="supplier-address">Alamat (opsional)</Label><Textarea id="supplier-address" maxLength={1000} value={draft?.address ?? ""} onChange={e => setDraft(d => d && { ...d, address: e.target.value })} /></FormField>
      {error ? <p role="alert" className="text-base text-red-800">{error}</p> : null}
    </fieldset></ModalContent><ModalFooter><Button type="button" variant="secondary" disabled={busy} onClick={close}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Menyimpan?" : "Simpan"}</Button></ModalFooter></form></Modal>
  </section>;
}
