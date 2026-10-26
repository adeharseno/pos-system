"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardHeader, FormField, Input, Label } from "@/modules/ui/components";
import { logoutAction } from "../actions";
import { employeeRequest, uiError } from "./employee-request";
import { passwordSetupError } from "../employee-form-rules";

export function InvitationActivation({ ready }: { ready: boolean }) {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const validation = passwordSetupError(password, confirmation);
    if (validation) { setError(validation); return; }
    setBusy(true); setError("");
    try { await employeeRequest("/api/auth/invitations/password", "POST", { password }); setPassword(""); setConfirmation(""); setDone(true); }
    catch (cause) { setError(uiError(cause)); } finally { setBusy(false); }
  }
  return <Card className="w-full max-w-md"><CardHeader><p className="mb-2 text-xs font-semibold tracking-widest text-[var(--text-muted)]">PHARMACY POS</p><h1 className="text-xl font-bold">{done ? "Akun Siap Digunakan" : ready ? "Aktivasi Akun Karyawan" : "Undangan Tidak Berlaku"}</h1></CardHeader><CardContent>
    {done ? <div className="grid gap-4"><p role="status" className="text-sm">Kata sandi berhasil disimpan. Silakan masuk menggunakan email dan kata sandi Anda.</p><form action={logoutAction}><Button className="w-full">Lanjut ke Login</Button></form></div> : !ready ? <div className="grid gap-4"><p className="text-sm">Tautan undangan sudah kedaluwarsa, sudah digunakan, atau akun tidak aktif. Minta pemilik mengirim ulang undangan.</p><p className="text-sm text-[var(--text-muted)]">Jika Anda sudah menyelesaikan aktivasi, silakan masuk seperti biasa.</p><Link href="/login" className="min-h-11 content-center rounded border px-4 py-2 text-center text-sm font-semibold">Kembali ke Login</Link></div> : <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="text-sm text-[var(--text-muted)]">Undangan sudah diverifikasi. Buat kata sandi untuk akun Anda. Jangan bagikan kata sandi kepada orang lain.</p>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <FormField><Label htmlFor="setup-password">Kata sandi baru</Label><Input id="setup-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} disabled={busy} autoFocus required /><p className="text-xs text-[var(--text-muted)]">Minimal 12 karakter. Gabungkan kata, angka, dan tanda baca yang mudah Anda ingat.</p></FormField>
      <FormField><Label htmlFor="setup-confirmation">Ulangi kata sandi</Label><Input id="setup-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} maxLength={128} disabled={busy} required /></FormField>
      <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Aktifkan Akun"}</Button>
    </form>}
  </CardContent></Card>;
}
