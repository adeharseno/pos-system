export function sellingPriceFromCost(costPrice: number, taxRate: number, marginPercent: number): number | null {
  if (!Number.isFinite(costPrice) || !Number.isFinite(taxRate) || !Number.isFinite(marginPercent)) return null;
  if (costPrice < 0 || taxRate < 0 || marginPercent < 0) return null;
  return Math.round(costPrice * (1 + marginPercent / 100) * (1 + taxRate / 100));
}

export function marginFromSellingPrice(costPrice: number, taxRate: number, sellingPrice: number): number | null {
  if (!Number.isFinite(costPrice) || !Number.isFinite(taxRate) || !Number.isFinite(sellingPrice)) return null;
  if (costPrice <= 0 || taxRate < 0 || sellingPrice < 0) return null;
  return (sellingPrice / (1 + taxRate / 100) / costPrice - 1) * 100;
}

export function formatMarginPercent(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}
