// PostgreSQL numeric amounts have two decimal places. Work in integer cents
// and mirror the RPC's separate subtotal/tax rounding and final remainder.
export function amountCents(value: number): bigint {
  const parts = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!parts) throw new Error("Invalid persisted refund amount");
  return BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? "").padEnd(2, "0"));
}

export function refundPreviewCents(input: {
  purchasedBase: number; returnedBase: number; quantityBase: number;
  subtotal: bigint; tax: bigint; returnedSubtotal: bigint; returnedTax: bigint;
}): bigint {
  const { purchasedBase, returnedBase, quantityBase } = input;
  if (![purchasedBase, returnedBase, quantityBase].every(Number.isSafeInteger) ||
      purchasedBase <= 0 || returnedBase < 0 || quantityBase <= 0 ||
      returnedBase + quantityBase > purchasedBase) throw new Error("Invalid return quantity");
  if (returnedBase + quantityBase === purchasedBase) {
    return input.subtotal - input.returnedSubtotal + input.tax - input.returnedTax;
  }
  const divisor = BigInt(purchasedBase);
  const round = (amount: bigint) => (amount * BigInt(quantityBase) * BigInt(2) + divisor) / (BigInt(2) * divisor);
  return round(input.subtotal) + round(input.tax);
}

export function formatRefundCents(value: bigint): string {
  const whole = (value / BigInt(100)).toLocaleString("id-ID");
  const fraction = value % BigInt(100);
  return `Rp ${whole}${fraction ? `,${fraction.toString().padStart(2, "0")}` : ""}`;
}
