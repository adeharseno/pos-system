import { notFound, redirect } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getCustomerReturns, getTransaction } from "@/modules/sales/data/transaction-queries";
import { requireUuid } from "@/modules/shared/validation/input";
import { CustomerReturnRequestForm } from "@/modules/returns/components/customer-return-request-form";
import { returnQuantity } from "@/modules/returns/return-quantity";

type ReturnItem = { transaction_item_id: string; quantity_in_base: number };
type ReturnRecord = {
  status?: string;
  return_items: ReturnItem[] | null;
};
type TransactionItem = {
  id: string;
  product_name_snapshot: string;
  unit_name_snapshot: string;
  quantity_in_unit: number;
  quantity_in_base: number;
  conversion_to_base_snapshot: number;
  total_amount: number;
};

export default async function TransactionReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePosOperator();
  const { id } = await params;
  let tx: string;
  try {
    tx = requireUuid(id, "id");
  } catch {
    notFound();
  }

  const row = await getTransaction(tx);
  if (!row) notFound();
  if (row.status !== "completed") redirect(`/transactions/${tx}`);

  const returns = (await getCustomerReturns(tx)) as unknown as ReturnRecord[];
  const returned = new Map<string, number>();

  for (const record of returns) {
    // Only non-rejected returns count towards returned quantity
    if (record.status !== "rejected") {
      for (const item of record.return_items ?? []) {
        returned.set(
          item.transaction_item_id,
          (returned.get(item.transaction_item_id) ?? 0) + item.quantity_in_base
        );
      }
    }
  }

  const items = (row.transaction_items as TransactionItem[]).map((item) => {
    const returnedBase = returned.get(item.id) ?? 0;
    return {
      id: item.id,
      name: item.product_name_snapshot,
      unit: item.unit_name_snapshot,
      price: item.total_amount,
      conversion: item.conversion_to_base_snapshot,
      purchasedBase: item.quantity_in_base,
      returnedBase,
      ...returnQuantity({
        purchasedBase: item.quantity_in_base,
        returnedBase,
        conversionToBase: item.conversion_to_base_snapshot,
      }),
    };
  });

  const receivableRaw = row.customer_receivables as
    | { outstanding_amount?: number | null }
    | Array<{ outstanding_amount?: number | null }>
    | null;
  const receivableRecord = Array.isArray(receivableRaw) ? receivableRaw[0] ?? null : receivableRaw;
  const outstandingReceivable =
    row.payment_method === "tempo" && receivableRecord
      ? Number(receivableRecord.outstanding_amount ?? 0)
      : null;

  return (
    <CustomerReturnRequestForm
      transaction={{
        id: row.id,
        invoice: row.invoice_number,
        payment: row.payment_method as "cash" | "qris" | "bank_transfer" | "bpjs" | "tempo",
        outstandingReceivable,
        items,
      }}
    />
  );
}
