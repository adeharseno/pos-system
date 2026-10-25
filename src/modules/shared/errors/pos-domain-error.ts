export const POS_DOMAIN_ERROR_CODES = [
  "INSUFFICIENT_STOCK",
  "STOCK_OPNAME_IN_PROGRESS",
  "INVALID_TRANSACTION_STATE",
  "TRANSACTION_ALREADY_VOIDED",
  "QRIS_ALREADY_CONFIRMED",
  "PAID_TRANSACTION_REQUIRES_RETURN",
  "RETURN_QUANTITY_EXCEEDED",
  "NO_ACTIVE_CASH_DRAWER",
  "INVALID_PRODUCT_UNIT",
  "INVALID_BATCH",
  "TRANSACTION_NOT_FOUND",
  "NOT_QRIS_TRANSACTION",
  "INVALID_EMPLOYEE",
  "INVALID_CART",
  "INSUFFICIENT_CASH",
  "INVALID_PAYMENT_DATA",
  "PRESCRIPTION_REQUIRED",
  "TRANSACTION_HAS_RETURNS",
  "RETURN_REASON_REQUIRED",
  "VOID_REASON_REQUIRED",
  "INVALID_RETURN_ITEMS",
  "DUPLICATE_RETURN_ITEM",
  "DUPLICATE_BATCH",
  "INVALID_TRANSACTION_ITEM",
  "INVALID_REFUND_DRAWER",
  "INVALID_ORIGINAL_ALLOCATION",
  "STOCK_OPNAME_NOT_FOUND",
  "STOCK_OPNAME_ITEM_NOT_FOUND",
  "INVALID_STOCK_OPNAME_STATE",
  "PHYSICAL_QUANTITY_REQUIRED",
  "INVALID_STORAGE_LOCATION",
  "CASH_DRAWER_ALREADY_OPEN",
  "CASH_DRAWER_ALREADY_CLOSED",
  "INVALID_OPENING_BALANCE",
  "INVALID_CLOSING_BALANCE",
  "FORBIDDEN",
  "DUPLICATE_SKU", "DUPLICATE_BARCODE", "DUPLICATE_CATEGORY", "DUPLICATE_SUBCATEGORY", "DUPLICATE_TAX_NAME", "DUPLICATE_TAX_RATE", "TAX_NOT_FOUND", "CATEGORY_NOT_FOUND", "SUBCATEGORY_NOT_FOUND", "CATEGORY_IN_USE", "SUBCATEGORY_IN_USE", "INVALID_CATEGORY_SUBCATEGORY", "INVALID_PRODUCT_INPUT", "INVALID_SUPPLIER", "BASE_UNIT_MISMATCH", "PRODUCT_NOT_FOUND", "PRODUCT_INACTIVE", "EXPIRED_BATCH", "INVALID_EXPIRY", "INVALID_QUANTITY", "INVALID_COST", "PRODUCT_UNIT_NOT_FOUND", "BASE_UNIT_PROTECTED", "DUPLICATE_UNIT_NAME", "INVALID_CONVERSION", "INVALID_SELLING_PRICE",
] as const;

export type PosDomainErrorCode = (typeof POS_DOMAIN_ERROR_CODES)[number];

const codeSet = new Set<string>(POS_DOMAIN_ERROR_CODES);

export class PosDomainError extends Error {
  readonly name = "PosDomainError";
  readonly technicalCause?: unknown;

  constructor(
    public readonly code: PosDomainErrorCode,
    technicalCause?: unknown,
  ) {
    super(code);
    Object.defineProperty(this, "technicalCause", { value: technicalCause, enumerable: false });
  }
}

export class PosDataAccessError extends Error {
  readonly name = "PosDataAccessError";
  readonly publicMessage = "DATABASE_OPERATION_FAILED";
  readonly technicalCause?: unknown;

  constructor(technicalCause?: unknown) {
    super("Database operation failed");
    Object.defineProperty(this, "technicalCause", { value: technicalCause, enumerable: false });
  }
}

type DatabaseErrorLike = { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };

export function mapDatabaseError(error: unknown): PosDomainError | PosDataAccessError {
  const candidate = error as DatabaseErrorLike | null;
  const searchable = [candidate?.message, candidate?.details, candidate?.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const code = POS_DOMAIN_ERROR_CODES.find((knownCode) =>
    new RegExp(`(^|[^A-Z_])${knownCode}([^A-Z_]|$)`).test(searchable),
  );

  return code && codeSet.has(code)
    ? new PosDomainError(code, error)
    : new PosDataAccessError(error);
}
