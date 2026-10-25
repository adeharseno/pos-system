import { redirect } from "next/navigation";

import { requireRole } from "@/modules/auth/application/auth-service";
import { StockOpnameWorkspace } from "@/modules/inventory/components/stock-opname-workspace";
import { Container } from "@/modules/ui/components";

export default async function StockOpnamePage() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/inventory"); }

  return <Container size="xl"><header className="mb-6"><h1 className="text-2xl font-bold">Hitung Stok Barang</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Periksa jumlah barang yang tersedia di apotek.</p></header><StockOpnameWorkspace /></Container>;
}
