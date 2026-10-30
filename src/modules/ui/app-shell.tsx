"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import type { EmployeeRole } from "@/modules/auth/types";
import { UserMenu } from "./user-menu";
import { BoxIcon, CashDrawerIcon, ChartIcon, CloseIcon, HomeIcon, MenuIcon, SaleIcon, UsersIcon } from "./icons";

type NavItem = { label: string; href: string; icon: ComponentType<SVGProps<SVGSVGElement>>; admin?: boolean; posOperator?: boolean };
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Operasional", items: [{ label: "Beranda", href: "/dashboard", icon: HomeIcon }, { label: "Penjualan Baru", href: "/cashier", icon: SaleIcon, posOperator: true }, { label: "Sesi Kasir", href: "/cash-drawer", icon: CashDrawerIcon, posOperator: true }, { label: "Transaksi", href: "/transactions", icon: ChartIcon }] },
  { label: "Persediaan", items: [{ label: "Daftar Barang", href: "/products", icon: BoxIcon }, { label: "Persediaan", href: "/inventory", icon: BoxIcon }, { label: "Perhitungan Stok", href: "/inventory/opname", icon: ChartIcon, admin: true }] },
  { label: "Pengelolaan", items: [{ label: "Laporan", href: "/reports", icon: ChartIcon, admin: true }, { label: "Karyawan", href: "/employees", icon: UsersIcon, admin: true }] },
];

// Presentation adapted from TailAdmin AppSidebar/AppHeader; role filtering is retained.
export function AppShell({ employee, children }: { employee: { name: string; role: EmployeeRole }; drawerOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = menu.current;
    if (!open || !dialog) return;
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
  const currentItem = groups.flatMap(group => group.items).filter(item => item.href !== "#" && (pathname === item.href || pathname.startsWith(`${item.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  const title = currentItem?.label ?? (pathname === "/cash-drawer" ? "Sesi kasir" : pathname === "/expenses" ? "Pengeluaran" : "Beranda");

  if (pathname === "/cashier" || pathname.startsWith("/cashier/")) return <div className="flex h-[100dvh] flex-col overflow-hidden"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-white px-4 py-2"><Link href="/dashboard" className="mr-auto min-h-11 content-center text-sm font-semibold text-gray-700 hover:text-brand-500">Kembali ke Beranda</Link><nav aria-label="Menu kasir" className="flex items-center gap-2"><Link href="/cashier" aria-current={pathname === "/cashier" ? "page" : undefined} className={`rounded-lg px-4 py-3 text-sm font-medium ${pathname === "/cashier" ? "bg-brand-50 text-brand-500" : "text-gray-600 hover:bg-gray-50"}`}>Penjualan Baru</Link><Link href="/cashier/returns" aria-current={pathname === "/cashier/returns" ? "page" : undefined} className={`rounded-lg px-4 py-3 text-sm font-medium ${pathname === "/cashier/returns" ? "bg-brand-50 text-brand-500" : "text-gray-600 hover:bg-gray-50"}`}>Retur</Link>{(employee.role === "owner_admin" || employee.role === "kasir") ? <Link href="/cash-drawer" className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Kelola Sesi</Link> : null}</nav></header>{children}</div>;

  const nav = <>
    <Link href="/dashboard" onClick={() => setOpen(false)} className="mb-8 flex min-h-16 items-center gap-3">
      <Image src="/images/logo.png" width={52} height={52} alt="Logo Cipayung Farma" className="size-13 shrink-0 object-contain" />
      <strong className="text-lg leading-snug font-semibold text-gray-800">Apotek Cipayung Farma</strong>
    </Link>
    <nav aria-label="Menu utama" className="grid gap-7">
      {groups.map(group => {
        const items = group.items.filter(item => (!item.admin || employee.role === "owner_admin") && (!item.posOperator || employee.role === "owner_admin" || employee.role === "kasir"));
        if (!items.length) return null;
        return <div key={group.label}><p className="mb-3 px-3 text-sm font-medium text-gray-600">{group.label}</p><div className="grid gap-2">{items.map(item => {
          const active = item === currentItem;
          const Icon = item.icon;
          const className = `flex min-h-14 items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors ${active ? "bg-brand-50 text-brand-500" : "text-gray-700 hover:bg-gray-100"}`;
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
      <UserMenu name={employee.name} role={role} />
    </header>
    <dialog ref={menu} id="mobile-navigation" aria-label="Menu utama" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-gray-900/40">
      <div className="relative flex h-full w-[min(92vw,310px)] flex-col overflow-y-auto bg-white px-5 py-7 shadow-theme-lg"><button type="button" autoFocus aria-label="Tutup menu" className="mb-3 grid size-12 self-end place-items-center rounded-full text-gray-500 hover:bg-gray-100" onClick={() => setOpen(false)}><CloseIcon /></button>{nav}</div>
    </dialog>
    <div className="app-main min-h-screen">{children}</div>
  </>;
}
