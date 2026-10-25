"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormField, Input, Label, Select } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };
type SubcategoryModal = { mode: "create"; categoryId: string; name: string } | { mode: "edit"; id: string; categoryId: string; name: string } | null;

const messages: Record<string, string> = {
  DUPLICATE_SUBCATEGORY: "Nama subkategori sudah digunakan pada kategori ini.",
  SUBCATEGORY_IN_USE: "Subkategori masih digunakan dan tidak dapat dihapus.",
  SUBCATEGORY_NOT_FOUND: "Subkategori tidak ditemukan.",
  CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
};

function message(body: { error?: { code?: string } }, fallback: string) {
  return messages[body.error?.code ?? ""] ?? fallback;
}

export function SubcategoryManagement({ categories, subcategories }: { categories: Category[]; subcategories: Subcategory[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<SubcategoryModal>(null);
  const [modalError, setModalError] = useState("");
  const [tableError, setTableError] = useState("");
  const [busy, setBusy] = useState(false);

  function closeModal() {
    if (busy) return;
    setModal(null);
    setModalError("");
  }

  async function request(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
    if (!response.ok || !result.ok) throw new Error(message(result, "Subkategori gagal disimpan."));
  }

  async function submit() {
    if (!modal || busy) return;
    if (!modal.categoryId) { setModalError("Kategori wajib dipilih."); return; }
    if (!modal.name.trim()) { setModalError("Nama subkategori wajib diisi."); return; }
    setBusy(true);
    setModalError("");
    try {
      if (modal.mode === "create") await request(`/api/categories/${modal.categoryId}/subcategories`, "POST", { name: modal.name });
      else await request(`/api/subcategories/${modal.id}`, "PATCH", { name: modal.name, category_id: modal.categoryId });
      setModal(null);
      router.refresh();
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : "Subkategori gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Hapus subkategori ini? Subkategori yang masih digunakan tidak dapat dihapus.")) return;
    setBusy(true);
    setTableError("");
    try { await request(`/api/subcategories/${id}`, "DELETE"); router.refresh(); }
    catch (cause) { setTableError(cause instanceof Error ? cause.message : "Subkategori gagal dihapus."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-6 grid gap-5">
      <div className="flex justify-end"><Button type="button" onClick={() => { setModal({ mode: "create", categoryId: "", name: "" }); setModalError(""); }} disabled={busy}>Tambah Subkategori</Button></div>
      <Card>
        <CardHeader><h2 className="font-semibold">Daftar Subkategori</h2></CardHeader>
        <CardContent className="p-0">
          {tableError ? <p className="m-5 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{tableError}</p> : null}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nama Subkategori</th><th className="p-4">Kategori</th><th className="p-4">Tindakan</th></tr></thead><tbody>{subcategories.map((subcategory) => <tr key={subcategory.id} className="border-t border-[var(--border)]"><td className="p-4">{subcategory.name}</td><td className="p-4">{categories.find((category) => category.id === subcategory.category_id)?.name ?? "—"}</td><td className="p-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setModal({ mode: "edit", id: subcategory.id, categoryId: subcategory.category_id, name: subcategory.name }); setModalError(""); }} disabled={busy}>Ubah</Button><Button type="button" variant="danger" onClick={() => remove(subcategory.id)} disabled={busy}>Hapus</Button></div></td></tr>)}</tbody></table></div>
          {subcategories.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Belum ada subkategori.</p> : null}
        </CardContent>
      </Card>

      <Modal open={modal !== null} labelledBy="subcategory-modal-title" onClose={closeModal}>
        <ModalHeader id="subcategory-modal-title" onClose={closeModal}>{modal?.mode === "edit" ? "Ubah Subkategori" : "Tambah Subkategori"}</ModalHeader>
        <ModalContent><div className="grid gap-4"><FormField error={modalError}><Label htmlFor="subcategory-category">Kategori</Label><Select id="subcategory-category" value={modal?.categoryId ?? ""} onChange={(event) => setModal((current) => current ? { ...current, categoryId: event.target.value } : current)} error={Boolean(modalError)}><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></FormField><FormField error={modalError}><Label htmlFor="subcategory-name">Nama Subkategori</Label><Input id="subcategory-name" value={modal?.name ?? ""} onChange={(event) => setModal((current) => current ? { ...current, name: event.target.value } : current)} error={Boolean(modalError)} autoFocus /></FormField></div></ModalContent>
        <ModalFooter><Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>Batal</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button></ModalFooter>
      </Modal>
    </section>
  );
}
