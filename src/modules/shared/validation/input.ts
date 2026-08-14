export class PosInputError extends Error {
  readonly name = "PosInputError";
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUuid(value: string, field: string): string {
  if (!uuidPattern.test(value)) throw new PosInputError(`${field} must be a UUID`);
  return value;
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PosInputError(`${field} must be a positive integer`);
  }
  return value;
}

export function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new PosInputError(`${field} is required`);
  return normalized;
}

export function requireNonNegativeMoney(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new PosInputError(`${field} must be non-negative`);
  return value;
}
