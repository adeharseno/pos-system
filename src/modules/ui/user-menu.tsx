"use client";

import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/modules/auth/actions";
import { Button } from "./components";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const logout = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    logout.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div ref={root} className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" aria-label={`Menu akun ${name}`} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)} className="flex min-h-13 items-center gap-3 rounded-xl px-2 text-gray-800 hover:bg-gray-100">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-semibold text-brand-600">{name.trim().charAt(0).toUpperCase()}</span>
      <span className="hidden max-w-48 truncate text-base font-medium sm:block">{name}</span>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d={open ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open ? <div id={panelId} className="absolute right-0 top-full z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg">
      <p className="break-words text-lg font-semibold text-gray-800">{name}</p>
      <p className="mt-1 text-base text-gray-600">{role}</p>
      <form action={logoutAction} className="mt-5 border-t border-gray-200 pt-4"><Button ref={logout} type="submit" variant="secondary" className="w-full">Keluar</Button></form>
    </div> : null}
  </div>;
}
