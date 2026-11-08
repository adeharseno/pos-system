import type { CartLine } from "./cart";

export type SubmissionLock = { current: boolean };
export function acquireSubmissionLock(lock: SubmissionLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
export function releaseSubmissionLock(lock: SubmissionLock) { lock.current = false; }

export type ProductAvailability = { productId: string; availableStockBase: number };
export function reconcileCartWithAvailability(cart: CartLine[], availability: ProductAvailability[]) {
  const stock = new Map(availability.map(row => [row.productId, row.availableStockBase]));
  const changed: string[] = [];
  const next = cart.flatMap(line => {
    const available = stock.get(line.productId);
    if (available === undefined) return [line];
    const maximum = Math.floor(available / line.conversionToBase);
    if (maximum <= 0) { changed.push(`${line.productName}: stok habis`); return []; }
    if (line.quantity > maximum) {
      changed.push(`${line.productName}: tersisa ${maximum} ${line.unitLabel}`);
      return [{ ...line, quantity: maximum }];
    }
    return [line];
  });
  return { cart: next, message: changed.join("; ") };
}

const PENDING_STORAGE_KEY = "pos_pending_checkout";

export function computeCartFingerprint(cart: CartLine[]): string {
  return cart
    .map(line => `${line.productId}:${line.productUnitId}:${line.quantity}:${line.displayedUnitPrice}`)
    .sort()
    .join("|");
}

export type PersistedPendingCheckout = {
  requestId: string;
  cartFingerprint: string;
  uncertain: boolean;
  createdAt: number;
};

export function getPersistedPendingCheckout(cartFingerprint: string): PersistedPendingCheckout | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPendingCheckout;
    if (Date.now() - parsed.createdAt > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
      return null;
    }
    if (parsed.cartFingerprint === cartFingerprint) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistPendingCheckout(requestId: string, cartFingerprint: string, uncertain: boolean): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const data: PersistedPendingCheckout = {
      requestId,
      cartFingerprint,
      uncertain,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export function clearPersistedPendingCheckout(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // ignore
  }
}
