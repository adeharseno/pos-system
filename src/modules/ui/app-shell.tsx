"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EmployeeRole } from "@/modules/auth/types";
import { UserMenu } from "./user-menu";
import { BellIcon, CloseIcon, MenuIcon } from "./icons";
import { navigationGroups } from "./app-navigation";
import type { PurchaseDueReminder } from "@/modules/purchasing/due-reminder-model";
import { dueReminderLabel } from "@/modules/purchasing/due-reminder-model";
import { formatInvoiceAmount } from "@/modules/purchasing/invoice-presentation";

// Presentation adapted from TailAdmin AppSidebar/AppHeader; role filtering is retained.
export function AppShell({ employee, reminders = [], children }: { employee: { name: string; role: EmployeeRole }; reminders?: PurchaseDueReminder[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  const isOwner = employee.role === "owner_admin";
  const isPosOperator = employee.role === "owner_admin" || employee.role === "kasir";

  useEffect(() => {
    if (!open) return;
    const dialog = menu.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (breakpoint.matches) setOpen(false); };
    breakpoint.addEventListener("change", closeOnDesktop);
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      breakpoint.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  const role = employee.role === "owner_admin" ? "Pemilik" : employee.role === "kasir" ? "Kasir" : "Staf";
  const navigationItems = navigationGroups.flatMap(group => group.items.flatMap(item => [item, ...(item.children ?? [])]));
  const currentItem = navigationItems
    .filter(item => item.href !== "#" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const title = currentItem?.label ?? (pathname === "/expenses" ? "Pengeluaran" : "Beranda");

  if (pathname === "/cashier" || pathname.startsWith("/cashier/")) return <div className="flex h-[100dvh] flex-col overflow-hidden">{children}</div>;

  const nav = <>
    <Link href="/dashboard" onClick={() => setOpen(false)} className="mb-8 flex min-h-16 items-center gap-3">
      <Image src="/images/logo.png" width={52} height={52} alt="Logo Cipayung Farma" className="size-13 shrink-0 object-contain" />
      <strong className="text-lg leading-snug font-semibold text-gray-800">Apotek Cipayung Farma</strong>
    </Link>
    <nav aria-label="Menu utama" className="grid gap-7">
      {navigationGroups.map(group => {
        const items = group.items
          .filter(item => (!item.admin || isOwner) && (!item.posOperator || isPosOperator))
          .map(item => ({
            ...item,
            children: item.children?.filter(child => !child.admin || isOwner),
          }));
        if (!items.length) return null;
        return <div key={group.label}><p className="mb-3 px-3 text-sm font-medium text-gray-600">{group.label}</p><div className="grid gap-2">{items.map(item => {
          const Icon = item.icon;
          const children = item.children ?? [];
          const active = currentItem?.href === item.href || children.some(child => child.href === currentItem?.href);
          const className = `flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors ${active ? "bg-brand-50 text-brand-500" : "text-gray-700 hover:bg-gray-100"}`;
          if (children.length > 0) {
            return <div key={item.label} className="grid gap-1">
              <Link href={item.href} aria-current={currentItem?.href === item.href ? "page" : undefined} onClick={() => setOpen(false)} className={className}>
                <Icon className={`size-6 shrink-0 ${active ? "text-brand-500" : "text-gray-500"}`} />{item.label}
              </Link>
              <div className="grid gap-1 pl-9">{children.map(child => {
                const childActive = child.href === currentItem?.href;
                return <Link key={child.label} href={child.href} aria-current={childActive ? "page" : undefined} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${childActive ? "bg-brand-50 text-brand-500" : "text-gray-700 hover:bg-gray-100"}`}>{child.label}</Link>;
              })}</div>
            </div>;
          }
          return item.href === "#" ? <span key={item.label} aria-disabled="true" className={`${className} opacity-45`}><Icon className="size-6 shrink-0" />{item.label}</span> : <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={className}><Icon className={`size-6 shrink-0 ${active ? "text-brand-500" : "text-gray-500"}`} />{item.label}</Link>;
        })}</div></div>;
      })}
    </nav>
  </>;

  return <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col overflow-y-auto border-r border-[var(--border)] bg-white px-5 py-7 lg:flex">{nav}</aside>
    <header className="fixed inset-x-0 top-0 z-30 flex h-20 items-center gap-3 border-b border-[var(--border)] bg-white px-4 sm:px-6 lg:left-[var(--sidebar-width)]">
      <button type="button" aria-expanded={open} aria-controls="mobile-navigation" aria-label="Buka menu" className="grid size-13 shrink-0 place-items-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 lg:hidden" onClick={() => setOpen(true)}><MenuIcon /></button>
      <p className="min-w-0 flex-1 text-lg leading-tight font-semibold sm:text-xl text-gray-800">{title}</p>
      {isOwner ? <div className="relative"><button type="button" aria-label={`Pengingat hutang${reminders.length?` (${reminders.length})`:""}`} aria-expanded={bellOpen} onClick={()=>setBellOpen(value=>!value)} className="relative grid size-12 place-items-center rounded-lg text-gray-700 hover:bg-gray-100"><BellIcon className="size-6"/>{reminders.length?<span className="absolute right-1 top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-semibold text-white">{reminders.length>99?"99+":reminders.length}</span>:null}</button>{bellOpen?<div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"><div className="border-b border-gray-200 p-4"><p className="font-semibold">Jatuh Tempo Invoice</p><p className="mt-1 text-sm text-gray-600">{reminders.length} invoice perlu diperhatikan</p></div>{reminders.length?<ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">{reminders.slice(0,10).map(item=><li key={item.id}><Link href={`/purchase-invoices/${item.id}`} onClick={()=>setBellOpen(false)} className="block p-4 hover:bg-gray-50"><p className="font-medium">{item.supplier} · {item.invoiceNumber}</p><p className="mt-1 text-sm text-gray-600">{formatInvoiceAmount(item.outstanding)} · {item.dueDate}</p><p className={`mt-1 text-sm font-medium ${item.daysRemaining<0?"text-red-700":"text-amber-700"}`}>{dueReminderLabel(item.daysRemaining)}</p></Link></li>)}</ul>:<p className="p-5 text-sm text-gray-600">Tidak ada invoice yang mendekati jatuh tempo.</p>}</div>:null}</div> : null}
      <UserMenu name={employee.name} role={role} />
    </header>
    <dialog ref={menu} id="mobile-navigation" aria-label="Menu utama" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-gray-900/40">
      <div className="relative flex h-full w-[min(92vw,310px)] flex-col overflow-y-auto bg-white px-5 py-7 shadow-theme-lg"><button type="button" autoFocus aria-label="Tutup menu" className="mb-3 grid size-12 self-end place-items-center rounded-full text-gray-500 hover:bg-gray-100" onClick={() => setOpen(false)}><CloseIcon /></button>{nav}</div>
    </dialog>
    <div className="app-main min-h-screen">{children}</div>
  </>;
}
