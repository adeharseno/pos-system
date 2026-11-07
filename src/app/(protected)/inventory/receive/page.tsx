import { redirect } from "next/navigation";

export default function ReceiveStockPage() {
  redirect("/purchase-invoices/new");
}
