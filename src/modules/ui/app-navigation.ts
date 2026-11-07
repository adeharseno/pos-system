import type { ComponentType, SVGProps } from "react";

import { BoxIcon, CartIcon, ChartIcon, HomeIcon, UsersIcon } from "./icons";

type NavChild = { label: string; href: string; admin?: boolean };
export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  admin?: boolean;
  posOperator?: boolean;
  children?: NavChild[];
};

export const navigationGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Operasional",
    items: [
      { label: "Beranda", href: "/dashboard", icon: HomeIcon },
      { label: "Kasir", href: "/cashier", icon: CartIcon, posOperator: true },
      { label: "Transaksi", href: "/transactions", icon: ChartIcon },
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
