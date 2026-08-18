import type { CurrentCashDrawer } from "@/modules/cash-drawer/types";
export const cashierDrawerState=(drawer:CurrentCashDrawer|null)=>drawer?"available" as const:"drawer_required" as const;
