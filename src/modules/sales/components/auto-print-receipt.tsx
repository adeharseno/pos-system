"use client";

import { useRef } from "react";

// Print the existing, server-rendered receipt once; failures never affect checkout.
export function AutoPrintReceipt({ transactionId }: { transactionId: string }) {
  const attempted = useRef(false);

  return (
    <iframe
      title="Cetak struk otomatis"
      aria-hidden="true"
      tabIndex={-1}
      className="pointer-events-none fixed h-0 w-0 border-0"
      src={`/transactions/${encodeURIComponent(transactionId)}/receipt`}
      onLoad={(event) => {
        if (attempted.current) return;
        attempted.current = true;
        try {
          const receipt = event.currentTarget.contentWindow;
          if (!receipt?.document.querySelector(".receipt-document")) return;
          receipt.focus();
          receipt.print();
        } catch {
          // The success dialog still offers the receipt link if printing is blocked.
        }
      }}
    />
  );
}
