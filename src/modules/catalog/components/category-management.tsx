"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, FormField, Input, Label } from "@/modules/ui/components";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/modules/ui/modal";

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };
type CategoryModal = { mode: "create"; name: string } | { mode: "edit"; id: string; name: string } | null;

const messages: Record<string, string> = {
  DUPLICATE_CATEGORY: "Nama kategori sudah digunakan.",
  CATEGORY_IN_USE: "Kategori masih digunakan dan tidak dapat dihapus.",
  CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
};

function message(body: { error?: { code?: string } }, fallback: string) {
  return messages[body.error?.code ?? ""] ?? fallback;
}

export function CategoryManagement({ categories, subcategories }: { categories: Category[]; subcategories: Subcategory[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<CategoryModal>(null);
  const [modalError, setModalError] = useState("");
  const [tableError, setTableError] = useState("");
  const [busy, setBusy] = useState(false);

  function closeModal() {
    if (busy) return;
    setModal(null);
    setModalError("");
  }

  async function request(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
    if (!response.ok || !result.ok) throw new Error(message(result, "Kategori gagal disimpan."));
  }

  async function submit() {
    if (!modal || busy) return;
    if (!modal.name.trim()) {
      setModalError("Nama kategori wajib diisi.");
      return;
    }

    setBusy(true);
    setModalError("");
    try {
      if (modal.mode === "create") await request("/api/categories", "POST", { name: modal.name });
      else await request(`/api/categories/${modal.id}`, "PATCH", { name: modal.name });
      setModal(null);
      router.refresh();
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : "Kategori gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("Hapus kategori ini? Kategori yang masih digunakan tidak dapat dihapus.")) return;
    setBusy(true);
    setTableError("");
    try {
      await request(`/api/categories/${id}`, "DELETE");
      router.refresh();
    } catch (cause) {
      setTableError(cause instanceof Error ? cause.message : "Kategori gagal dihapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 grid gap-5">
      <div className="flex justify-end">
        <Button type="button" onClick={() => { setModal({ mode: "create", name: "" }); setModalError(""); }} disabled={busy}>
          Tambah Kategori
        </Button>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">Daftar Kategori</h2></CardHeader>
        <CardContent className="p-0">
          {tableError ? <p className="m-5 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">{tableError}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nama Kategori</th><th className="p-4">Jumlah Subkategori</th><th className="p-4">Tindakan</th></tr></thead>
              <tbody>{categories.map((category) => <tr key={category.id} className="border-t border-[var(--border)]"><td className="p-4">{category.name}</td><td className="p-4">{subcategories.filter((subcategory) => subcategory.category_id === category.id).length}</td><td className="p-4"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => { setModal({ mode: "edit", id: category.id, name: category.name }); setModalError(""); }} disabled={busy}>Ubah</Button><Button type="button" variant="danger" onClick={() => remove(category.id)} disabled={busy}>Hapus</Button></div></td></tr>)}</tbody>
            </table>
          </div>
          {categories.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">Belum ada kategori.</p> : null}
        </CardContent>
      </Card>

      <Modal open={modal !== null} labelledBy="category-modal-title" onClose={closeModal}>
        <ModalHeader id="category-modal-title" onClose={closeModal}>{modal?.mode === "edit" ? "Ubah Kategori" : "Tambah Kategori"}</ModalHeader>
        <ModalContent>
          <FormField error={modalError}>
            <Label htmlFor="category-name">Nama Kategori</Label>
            <Input id="category-name" value={modal?.name ?? ""} onChange={(event) => setModal((current) => current ? { ...current, name: event.target.value } : current)} error={Boolean(modalError)} autoFocus />
          </FormField>
        </ModalContent>
        <ModalFooter><Button type="button" variant="secondary" onClick={closeModal} disabled={busy}>Batal</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button></ModalFooter>
      </Modal>
    </section>
  );
}
