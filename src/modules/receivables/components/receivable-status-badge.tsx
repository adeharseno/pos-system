import { receivableStatusPresentation } from "../receivables-filters";
import type { ReceivableEffectiveStatus } from "../receivables-types";

export function ReceivableStatusBadge({
  status,
  paidAmount = 0,
}: {
  status: ReceivableEffectiveStatus;
  paidAmount?: number;
}) {
  const { label, badgeClassName } = receivableStatusPresentation(status);
  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClassName}`}
      >
        {label}
      </span>
      {status === "overdue" && paidAmount > 0 ? (
        <span className="text-[11px] font-medium text-gray-500">Sebagian sudah dibayar</span>
      ) : null}
    </div>
  );
}

