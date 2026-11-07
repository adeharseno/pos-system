import { requireOwnerPermission } from "@/modules/auth/application/auth-service";

export default async function TransactionDetailLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPermission("transactions.view");
  return children;
}
