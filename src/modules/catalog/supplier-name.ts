import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";

export type SupplierNameCandidate = { id: string; name: string; is_active?: boolean };

/** Mirrors the database convention used by other master lists. */
export function normalizeSupplierName(name: string) {
  return name.trim().toLowerCase();
}

/**
 * Active supplier names must be unique in the application. Inactive suppliers
 * and the row being edited are ignored; the database deliberately allows
 * duplicate names so legacy imports can preserve their source data.
 */
export function findDuplicateActiveSupplier(
  name: string,
  candidates: SupplierNameCandidate[],
  excludeId?: string,
) {
  const normalized = normalizeSupplierName(name);
  return candidates.find(
    (candidate) =>
      candidate.is_active !== false &&
      candidate.id !== excludeId &&
      normalizeSupplierName(candidate.name) === normalized,
  );
}

export function assertActiveSupplierNameAvailable(
  name: string,
  candidates: SupplierNameCandidate[],
  excludeId?: string,
) {
  if (findDuplicateActiveSupplier(name, candidates, excludeId)) throw new PosDomainError("DUPLICATE_SUPPLIER");
}
