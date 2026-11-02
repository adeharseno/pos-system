"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormField, Input, Label } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";
import { SUBCATEGORY_LABEL } from "../master-data-labels";
import { subcategoryFormError, type SubcategoryFormErrors } from "../subcategory-form-rules";

type Subcategory = { id: string; name: string };
type SubcategoryModal = { mode: "create"; name: string } | { mode: "edit"; id: string; name: string } | null;

const messages: Record<string, string> = {
  DUPLICATE_SUBCATEGORY: "Nama subkategori sudah digunakan.",
  SUBCATEGORY_IN_USE: "Subkategori masih digunakan dan tidak dapat dihapus.",
  SUBCATEGORY_NOT_FOUND: "Subkategori tidak ditemukan.",
};

function message(body: { error?: { code?: string } }, fallback: string) {
  return messages[body.error?.code ?? ""] ?? fallback;
}

export function SubcategoryManagement({ subcategories }: { subcategories: Subcategory[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<SubcategoryModal>(null);
  const [fieldErrors, setFieldErrors] = useState<SubcategoryFormErrors>({});
  const [tableError, setTableError] = useState("");
  const [busy, setBusy] = useState(false);

  function closeModal() {
    if (busy) return;
    setModal(null);
    setFieldErrors({});
  }

  async function request(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
    if (!response.ok || !result.ok) throw new Error(message(result, "Subkategori gagal disimpan."));
  }

  async function submit() {
    if (!modal || busy) return;
    const errors = subcategoryFormError(modal.name);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      if (modal.mode === "create") await request("/api/subcategories", "POST", { name: modal.name });
      else await request(`/api/subcategories/${modal.id}`, "PATCH", { name: modal.name });
      setModal(null);
      router.refresh();
    } catch (cause) {
      setFieldErrors({ name: cause instanceof Error ? cause.message : "Subkategori gagal disimpan." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Hapus subkategori ini? Data yang masih digunakan tidak dapat dihapus.")) return;
    setBusy(true);
    setTableError("");
    try { await request(`/api/subcategories/${id}`, "DELETE"); router.refresh(); }
    catch (cause) { setTableError(cause instanceof Error ? cause.message : "Subkategori gagal dihapus."); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-6 grid gap-5">
      <div className="flex justify-end"><Button type="button" onClick={() => { setModal({ mode: "create", name: "" }); setFieldErrors({}); }} disabled={busy}>Tambah {SUBCATEGORY_LABEL}</Button></div>
      <Card>
        <CardHeader><h2 className="font-semibold">Daftar {SUBCATEGORY_LABEL}</h2></CardHeader>
        <CardContent className="p-0">
          {tableError ? <p className="m-5 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{tableError}</p> : null}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nama {SUBCATEGORY_LABEL}</th><th className="p-4">Tindakan</th></tr></thead><tbody>{subcategories.map((subcategory) => <tr key={subcategory.id} className="border-t border-[var(--border)]"><td className="p-4">{subcategory.name}</td><td className="p-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setModal({ mode: "edit", id: subcategory.id, name: subcategory.name }); setFieldErrors({}); }} disabled={busy}>Ubah</Button><Button type="button" variant="danger" onClick={() => remove(subcategory.id)} disabled={busy}>Hapus</Button></div></td></tr>)}</tbody></table></div>
          {subcategories.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Belum ada {SUBCATEGORY_LABEL.toLowerCase()}.</p> : null}
        </CardContent>
      </Card>

      <Modal open={modal !== null} labelledBy="subcategory-modal-title" onClose={closeModal}>
        <ModalHeader id="subcategory-modal-title" onClose={closeModal}>{modal?.mode === "edit" ? `Ubah ${SUBCATEGORY_LABEL}` : `Tambah ${SUBCATEGORY_LABEL}`}</ModalHeader>
        <ModalContent><div className="grid gap-4"><FormField error={fieldErrors.name}><Label htmlFor="subcategory-name">Nama {SUBCATEGORY_LABEL}</Label><Input id="subcategory-name" value={modal?.name ?? ""} onChange={(event) => { setModal((current) => current ? { ...current, name: event.target.value } : current); setFieldErrors({}); }} error={Boolean(fieldErrors.name)} autoFocus /></FormField></div></ModalContent>
        <ModalFooter><Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>Batal</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button></ModalFooter>
      </Modal>
    </section>
  );
}
