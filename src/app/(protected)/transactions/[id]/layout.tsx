import { requirePermission } from "@/modules/auth/application/auth-service";

export default async function TransactionDetailLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("transactions.view");
  return children;
}
