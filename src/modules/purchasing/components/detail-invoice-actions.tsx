"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilIcon, TrashIcon } from "@/modules/ui/icons";
import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { checkInvoiceDeleteEligibility } from "../invoice-input";
import { productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";

export interface DetailInvoiceActionsProps {
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    supplier_name: string;
    payments_count: number;
    total_amount: number;
    paid_amount: number;
  };
}

export function DetailInvoiceActions({ invoice }: DetailInvoiceActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const eligibility = checkInvoiceDeleteEligibility({
    status: invoice.status,
    paymentsCount: invoice.payments_count,
    totalPaid: invoice.paid_amount,
  });

  const isCompleted = invoice.status === "completed";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Edit Invoice Button */}
      {isCompleted ? (
        <span
          title="Invoice yang sudah selesai tidak dapat diubah item dan stoknya."
          className="inline-flex min-h-13 cursor-not-allowed items-center justify-center rounded-lg border border-gray-200 bg-gray-100 px-5 py-3 text-base font-medium text-gray-400"
        >
          <PencilIcon className="mr-2 size-5" />
          Edit Invoice (Terkunci)
        </span>
      ) : (
        <Link
          href={`/purchase-invoices/${invoice.id}/edit`}
          className={productPrimaryLinkClass}
        >
          <PencilIcon className="mr-2 size-5" />
          Edit Invoice
        </Link>
      )}

      {/* Delete Invoice Button (Styled in red) */}
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="inline-flex min-h-13 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-base font-semibold text-red-700 shadow-theme-xs transition hover:bg-red-100 focus:outline-none focus:ring-3 focus:ring-red-500/20"
      >
        <TrashIcon className="mr-2 size-5" />
        Hapus Invoice
      </button>

      {/* Delete Confirmation / Info Dialog */}
      <DeleteInvoiceDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        supplierName={invoice.supplier_name}
        canDelete={eligibility.canDelete}
        reason={eligibility.reason}
        onSuccess={() => {
          router.push("/purchase-invoices");
          router.refresh();
        }}
      />
    </div>
  );
}
