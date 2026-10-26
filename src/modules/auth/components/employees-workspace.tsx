"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, FormField, Input, Label, Select, Textarea } from "@/modules/ui/components";
import { Modal, ModalContent, ModalHeader } from "@/modules/ui/modal";
import { canInvite, filterEmployees, lastUsableOwner, parseEmployees, ROLE_LABELS, STATUS_LABELS, type EmployeeRow, type PermissionCatalog } from "../employee-ui-model";
import { employeeRequest, uiError } from "./employee-request";
import { EmployeeForm } from "./employee-form";
import { EmployeeAccessSettings } from "./employee-access";

export function EmployeesWorkspace({ catalog }: { catalog: PermissionCatalog }) {
  const router = useRouter();
  const [rows, setRows] = useState<EmployeeRow[]>([]), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""), [role, setRole] = useState(""), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<EmployeeRow | null | undefined>(undefined);
  const [access, setAccess] = useState<EmployeeRow | null>(null), [invite, setInvite] = useState<EmployeeRow | null>(null);
  const [toggle, setToggle] = useState<EmployeeRow | null>(null), [email, setEmail] = useState(""), [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const all: EmployeeRow[] = [];
        for (let offset = 0; ; offset += 100) {
          const page = parseEmployees(await employeeRequest(`/api/employees?limit=100&offset=${offset}`, "GET", undefined, abort.signal));
          all.push(...page); if (page.length < 100) break;
        }
        if (!abort.signal.aborted) { setRows([...new Map(all.map(row => [row.id, row])).values()]); setLoading(false); }
      } catch (cause) { if (!abort.signal.aborted) { setError(uiError(cause)); setLoading(false); } }
    }
    void load(); return () => abort.abort();
  }, [reload]);
  function refresh() { setLoading(true); setError(""); setReload(value => value + 1); }
  function close() { if (!busy) { setEditing(undefined); setInvite(null); setToggle(null); setDialogError(""); } }
  function saved(message: string) { setEditing(undefined); setInvite(null); setToggle(null); setNotice(message); refresh(); router.refresh(); }
  async function sendInvite(event: FormEvent) {
    event.preventDefault(); if (!invite || busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setDialogError("Isi alamat email yang benar."); return; }
    setBusy(true); setDialogError("");
    try { await employeeRequest(`/api/employees/${invite.id}/invite`, "POST", { email }); saved("Undangan berhasil dikirim. Karyawan dapat membuka email untuk mengatur kata sandi."); }
    catch (cause) { setDialogError(uiError(cause)); } finally { setBusy(false); }
  }
  async function changeStatus(event: FormEvent) {
    event.preventDefault(); if (!toggle || busy) return;
    if (!reason.trim()) { setDialogError("Isi alasan perubahan status terlebih dahulu."); return; }
    setBusy(true); setDialogError("");
    try { await employeeRequest(`/api/employees/${toggle.id}/access`, "PATCH", { is_active: !toggle.is_active, reason }); saved(toggle.is_active ? "Karyawan berhasil dinonaktifkan." : "Karyawan berhasil diaktifkan."); }
    catch (cause) { setDialogError(uiError(cause)); } finally { setBusy(false); }
  }
  const filtered = filterEmployees(rows, search, role, status);
  function actions(row: EmployeeRow) {
    const protectedOwner = lastUsableOwner(rows, row);
    return <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => { setEditing(row); setDialogError(""); }} disabled={busy}>Ubah</Button>
      <Button variant="secondary" onClick={() => setAccess(row)} disabled={busy}>Kelola Akses</Button>
      <Button variant="secondary" onClick={() => { setToggle(row); setReason(""); setDialogError(""); }} disabled={busy || protectedOwner} title={protectedOwner ? "Pemilik aktif terakhir harus tetap aktif." : undefined}>{row.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>
      {canInvite(row) && <Button variant="secondary" onClick={() => { setInvite(row); setEmail(row.email ?? ""); setDialogError(""); }} disabled={busy}>{row.account_status === "not_invited" ? "Kirim Undangan" : "Kirim Ulang Undangan"}</Button>}
      {protectedOwner && <p className="basis-full text-xs text-amber-900">Pemilik aktif terakhir dilindungi.</p>}
      {row.account_status === "failed" && <p className="basis-full text-xs text-red-800">Email akun bertentangan. Pengiriman ulang dikunci untuk melindungi akun yang sudah ada.</p>}
      {row.account_status === "retryable" && !row.retryable && <p className="basis-full text-xs text-[var(--text-muted)]">Undangan sedang diproses. Tunggu beberapa saat lalu muat ulang daftar.</p>}
    </div>;
  }
  if (access) return <EmployeeAccessSettings key={access.id} employee={access} onClose={() => { setAccess(null); refresh(); }} />;
  return <section className="grid gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Karyawan</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Kelola data karyawan, akun login, dan hak akses apotek.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={refresh} disabled={busy || loading}>Muat Ulang</Button><Button onClick={() => { setEditing(null); setDialogError(""); }} disabled={busy || loading}>Tambah Karyawan</Button></div></header>
    {notice && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div role="alert" className="grid gap-3 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><div><Button variant="secondary" onClick={refresh}>Coba Lagi</Button></div></div>}
    <Card><CardContent><div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <FormField><Label htmlFor="employee-search">Cari karyawan</Label><Input id="employee-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nama atau email" /></FormField>
      <FormField><Label htmlFor="employee-role-filter">Peran</Label><Select id="employee-role-filter" value={role} onChange={e => setRole(e.target.value)}><option value="">Semua Peran</option>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
      <FormField><Label htmlFor="employee-status-filter">Status akun</Label><Select id="employee-status-filter" value={status} onChange={e => setStatus(e.target.value)}><option value="">Semua Status</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
    </div></CardContent></Card>
    {loading ? <Card><CardContent><p role="status">Memuat daftar karyawan…</p></CardContent></Card> : !error && filtered.length === 0 ? <Card><CardContent className="py-10 text-center"><h2 className="font-semibold">{rows.length ? "Tidak ada karyawan yang cocok." : "Belum ada karyawan."}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{rows.length ? "Coba ubah pencarian atau filter." : "Gunakan Tambah Karyawan untuk memulai."}</p>{rows.length > 0 && <Button variant="secondary" className="mt-4" onClick={() => { setSearch(""); setRole(""); setStatus(""); }}>Atur Ulang Filter</Button>}</CardContent></Card> : <>
      <p className="text-sm text-[var(--text-muted)]">{filtered.length} karyawan ditampilkan</p>
      <div className="hidden overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white lg:block"><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-subtle)]"><tr><th className="p-4">Nama / Email</th><th className="p-4">Peran</th><th className="p-4">Status Akun</th><th className="p-4">Tindakan</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id} className="border-t border-[var(--border)]"><td className="max-w-64 break-words p-4"><strong>{row.full_name}</strong><p className="mt-1 text-[var(--text-muted)]">{row.email ?? "Belum ada email login"}</p></td><td className="p-4">{ROLE_LABELS[row.position]}</td><td className="p-4">{STATUS_LABELS[row.account_status]}</td><td className="max-w-md p-4">{actions(row)}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 lg:hidden">{filtered.map(row => <Card key={row.id}><CardContent><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{row.full_name}</h2><span className="rounded bg-zinc-100 px-2 py-1 text-xs">{STATUS_LABELS[row.account_status]}</span></div><p className="mt-2 break-all text-sm text-[var(--text-muted)]">{row.email ?? "Belum ada email login"}</p><p className="my-3 text-sm">{ROLE_LABELS[row.position]}</p>{actions(row)}</CardContent></Card>)}</div>
    </>}
    <Modal open={editing !== undefined || Boolean(invite) || Boolean(toggle)} labelledBy="employee-dialog-title" onClose={close}>
      <ModalHeader id="employee-dialog-title" onClose={close}>{editing !== undefined ? editing ? "Ubah Karyawan" : "Tambah Karyawan" : invite ? "Undangan Akun Karyawan" : toggle?.is_active ? "Nonaktifkan Karyawan?" : "Aktifkan Karyawan?"}</ModalHeader>
      <ModalContent>
        {editing !== undefined && <EmployeeForm key={editing?.id ?? "new"} employee={editing} catalog={catalog} protectedOwner={Boolean(editing && lastUsableOwner(rows, editing))} onSaved={saved} onCancel={close} onBusyChange={setBusy} />}
        {invite && <form onSubmit={sendInvite} noValidate className="grid gap-4"><p className="text-sm">Kirim tautan aktivasi kepada <strong>{invite.full_name}</strong>. Karyawan mengatur kata sandinya sendiri.</p>{dialogError && <p role="alert" className="text-sm text-red-800">{dialogError}</p>}<FormField><Label htmlFor="invite-email">Email untuk login</Label><Input id="invite-email" type="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={Boolean(invite.email)} disabled={busy} autoFocus required /></FormField><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={close} disabled={busy}>Batal</Button><Button type="submit" disabled={busy}>{busy ? "Mengirim…" : invite.email ? "Kirim Ulang Undangan" : "Kirim Undangan"}</Button></div></form>}
        {toggle && <form onSubmit={changeStatus} noValidate className="grid gap-4"><p className="text-sm">{toggle.is_active ? `${toggle.full_name} tidak dapat menggunakan aplikasi setelah dinonaktifkan, termasuk sesi yang masih terbuka.` : `Aktifkan kembali akses ${toggle.full_name}. Jika akun belum diundang, kirim undangan setelah aktivasi.`}</p>{dialogError && <p role="alert" className="text-sm text-red-800">{dialogError}</p>}<FormField><Label htmlFor="status-reason">Alasan perubahan status</Label><Textarea id="status-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={busy} autoFocus required /></FormField><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={close} disabled={busy}>Batal</Button><Button variant={toggle.is_active ? "danger" : "primary"} disabled={busy}>{busy ? "Menyimpan…" : toggle.is_active ? "Ya, Nonaktifkan" : "Ya, Aktifkan"}</Button></div></form>}
      </ModalContent>
    </Modal>
  </section>;
}
