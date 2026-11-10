import type { ComponentType, SVGProps } from "react";
import type { EmployeeRole } from "@/modules/auth/types";

import { BoxIcon, CartIcon, ChartIcon, HomeIcon, UsersIcon } from "./icons";

type NavChild = { label: string; href: string; admin?: boolean };
export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  admin?: boolean;
  posOperator?: boolean;
  cashier?: boolean;
  children?: NavChild[];
};

export const navigationGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Operasional",
    items: [
      { label: "Beranda", href: "/dashboard", icon: HomeIcon },
      { label: "Kasir", href: "/cashier", icon: CartIcon, posOperator: true },
      { label: "Transaksi", href: "/transactions", icon: ChartIcon, cashier: true },
      { label: "Retur Penjualan", href: "/returns", icon: BoxIcon, admin: true },
    ],
  },
  {
    label: "Persediaan",
    items: [
      {
        label: "Master Barang",
        href: "/products",
        icon: BoxIcon,
        children: [
          { label: "Kelola Kategori", href: "/products/categories", admin: true },
          { label: "Kelola Subkategori", href: "/products/subcategories", admin: true },
          { label: "Kelola Pajak", href: "/products/taxes", admin: true },
          { label: "Kelola Pemasok", href: "/products/suppliers", admin: true },
        ],
      },
      { label: "Manajemen Stok", href: "/inventory", icon: BoxIcon },
    ],
  },
  {
    label: "Pengelolaan",
    items: [
      { label: "Laporan", href: "/reports", icon: ChartIcon, admin: true },
      { label: "Karyawan", href: "/employees", icon: UsersIcon, admin: true },
    ],
  },
];

export function navigationGroupsForRole(role: EmployeeRole) {
  const isOwner = role === "owner_admin";
  const isPosOperator = isOwner || role === "kasir";
  return navigationGroups.map(group => ({
    ...group,
    items: group.items
      .filter(item => role !== "kasir" ? (!item.admin || isOwner) && (!item.posOperator || isPosOperator) : item.posOperator || item.cashier)
      .map(item => ({ ...item, children: item.children?.filter(child => !child.admin || isOwner) })),
  })).filter(group => group.items.length > 0);
}
