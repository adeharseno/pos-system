"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardContent, FormField, Label, Select, Textarea } from "@/modules/ui/components";
import { parseEmployeeAccess, protectedPermission, ROLE_LABELS, type EmployeeAccess, type EmployeeRow } from "../employee-ui-model";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "../permission-labels";
import type { Permission } from "../permissions";
import { employeeRequest, uiError } from "./employee-request";

type Setting = "default" | "allow" | "deny";
export function EmployeeAccessSettings({ employee, onClose }: { employee: EmployeeRow; onClose: () => void }) {
  const [access, setAccess] = useState<EmployeeAccess | null>(null), [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<Partial<Record<Permission, Setting>>>({});
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void employeeRequest(`/api/employees/${employee.id}/permissions`, "GET", undefined, abort.signal)
      .then(data => { setAccess(parseEmployeeAccess(data)); setLoading(false); })
      .catch(cause => { if (!abort.signal.aborted) { setError(uiError(cause)); setLoading(false); } });
    return () => abort.abort();
  }, [employee.id, retry]);
  function setting(code: Permission): Setting {
    return changes[code] ?? access?.overrides.find(row => row.permission === code)?.effect ?? "default";
  }
  async function save() {
    if (busy || !access) return;
    if (!reason.trim()) { setError("Isi alasan perubahan izin terlebih dahulu."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      for (const [permission, effect] of Object.entries(changes)) {
        await employeeRequest(`/api/employees/${employee.id}/permissions`, "PATCH", { permission, effect: effect === "default" ? null : effect, reason });
        setChanges(previous => { const next = { ...previous }; delete next[permission as Permission]; return next; });
      }
      setAccess(parseEmployeeAccess(await employeeRequest(`/api/employees/${employee.id}/permissions`)));
      setReason(""); setSuccess("Pengaturan izin berhasil disimpan.");
    } catch (cause) { setError(`${uiError(cause)} Perubahan yang belum berhasil tetap ditandai.`); setRetry(value => value + 1); }
    finally { setBusy(false); }
  }
  return <section className="grid gap-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Kelola Akses</h2><p className="mt-1 text-sm">{employee.full_name} · {ROLE_LABELS[employee.position]}</p></div><Button variant="secondary" onClick={onClose} disabled={busy}>Kembali ke Daftar</Button></header>
    <Card><CardContent><p className="text-sm">Izin bawaan berasal dari peran. Pilih <strong>Izinkan</strong> atau <strong>Larang</strong> untuk pengaturan individu. Pilih <strong>Ikuti Peran</strong> untuk menghapus pengaturan individu.</p><p className="mt-2 text-sm text-amber-900">Sebagian akses kasir, produk, stok, dan laporan masih mengikuti peran. Pengaturan individu disimpan di sini; perubahan tersebut belum menggantikan semua batas akses peran.</p></CardContent></Card>
    {loading && <p role="status">Memuat pengaturan akses…</p>}
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {!loading && !access && <Button variant="secondary" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Coba Lagi</Button>}
    {access && <>
      {access.role === "owner_admin" && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Pemilik selalu memiliki seluruh izin. Izin pemilik tidak dapat dikurangi melalui pengaturan individu.</p>}
      {!access.account_enabled && <p className="rounded bg-zinc-100 p-3 text-sm">Akun belum aktif atau belum terhubung. Pengaturan dapat disiapkan, tetapi karyawan belum dapat mengakses aplikasi.</p>}
      {PERMISSION_GROUPS.map(group => <details key={group} className="rounded border border-[var(--border)] bg-white" open={group === "Produk" || group === "Dashboard"}>
        <summary className="cursor-pointer p-4 font-semibold">{group}</summary><div className="grid gap-3 border-t border-[var(--border)] p-4">
          {access.definitions.filter(code => PERMISSION_LABELS[code].group === group).map(code => {
            const label = PERMISSION_LABELS[code], inherited = access.preset.includes(code) || access.role === "owner_admin";
            const unsupported = code.startsWith("submissions.") || ["products.delete", "audit.view", "returns.view"].includes(code);
            const locked = access.role === "owner_admin" || protectedPermission(code) || unsupported;
            const source = setting(code);
            return <div key={code} className="grid gap-3 rounded border border-[var(--border)] p-3 md:grid-cols-[1fr_220px]">
              <div><h3 className="text-sm font-semibold">{label.label}</h3>{label.description && <p className="mt-1 text-sm text-[var(--text-muted)]">{label.description}</p>}
                <p className="mt-2 text-xs text-[var(--text-muted)]">Bawaan peran: {inherited ? "Diizinkan" : "Tidak diizinkan"} · {source === "default" ? "Mengikuti peran" : source === "allow" ? "Individu: Diizinkan" : "Individu: Dilarang"}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Izin akun tersimpan: {access.effective.includes(code) ? "Diizinkan" : "Tidak diizinkan"}</p>
                {locked && <p className="mt-1 text-xs text-[var(--text-muted)]">{unsupported ? "Fitur ini belum tersedia untuk pengaturan individu." : "Izin ini dilindungi dan hanya mengikuti peran pemilik."}</p>}
                {changes[code] && <p className="mt-1 text-xs font-medium text-amber-800">Belum disimpan</p>}
              </div><div>{locked ? <p className="text-sm">{access.role === "owner_admin" ? "Akses penuh pemilik" : unsupported ? "Belum tersedia" : "Dilindungi"}</p> : <Select aria-label={label.label} value={source} disabled={busy} onChange={event => {
                const value = event.target.value as Setting;
                const original = access.overrides.find(row => row.permission === code)?.effect ?? "default";
                setChanges(previous => { const next = { ...previous }; if (value === original) delete next[code]; else next[code] = value; return next; });
                setSuccess("");
              }}><option value="default">Ikuti Peran</option><option value="allow">Izinkan</option><option value="deny">Larang</option></Select>}</div>
            </div>;
          })}
        </div></details>)}
      {access.role !== "owner_admin" && <Card><CardContent><div className="grid gap-4"><FormField><Label htmlFor="access-reason">Alasan perubahan izin</Label><Textarea id="access-reason" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="Contoh: bertugas membantu pemeriksaan stok" /></FormField><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{Object.keys(changes).length} pengaturan belum disimpan</p><Button onClick={() => void save()} disabled={busy || !Object.keys(changes).length}>{busy ? "Menyimpan…" : "Simpan Perubahan Akses"}</Button></div></div></CardContent></Card>}
    </>}
  </section>;
}
