import { redirect } from "next/navigation";
import { jakartaToday } from "@/modules/sales/transaction-history-filters";

/**
 * The separate log page was merged into /transactions. Keep old bookmarks
 * working, including the log's former default of showing today.
 */
export default async function TransactionLogRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  if (!params.has("from") && !params.has("to")) {
    const today = jakartaToday();
    params.set("from", today);
    params.set("to", today);
  }
  redirect(`/transactions${params.size ? `?${params}` : ""}`);
}
