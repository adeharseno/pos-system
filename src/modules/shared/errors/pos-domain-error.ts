export const POS_DOMAIN_ERROR_CODES = [
  "SUPPLIER_NOT_FOUND",
  "INSUFFICIENT_STOCK",
  "STOCK_OPNAME_IN_PROGRESS",
  "INVALID_TRANSACTION_STATE",
  "TRANSACTION_ALREADY_VOIDED",
  "QRIS_ALREADY_CONFIRMED",
  "BANK_TRANSFER_ALREADY_CONFIRMED",
  "NOT_MANUAL_PAYMENT_TRANSACTION",
  "PAID_TRANSACTION_REQUIRES_RETURN",
  "RETURN_QUANTITY_EXCEEDED",
  "INVALID_PRODUCT_UNIT",
  "INVALID_BATCH",
  "TRANSACTION_NOT_FOUND",
  "NOT_QRIS_TRANSACTION",
  "INVALID_EMPLOYEE",
  "INVALID_CART",
  "INSUFFICIENT_CASH",
  "INVALID_PAYMENT_DATA",
  "PRESCRIPTION_REQUIRED",
  "PRESCRIPTION_METADATA_REQUIRED",
  "INVALID_PRESCRIPTION_CATEGORY",
  "BPJS_NUMBER_REQUIRED",
  "TRANSACTION_HAS_RETURNS",
  "RETURN_REASON_REQUIRED",
  "VOID_REASON_REQUIRED",
  "INVALID_RETURN_ITEMS",
  "DUPLICATE_RETURN_ITEM",
  "DUPLICATE_BATCH",
  "INVALID_TRANSACTION_ITEM",
  "INVALID_ORIGINAL_ALLOCATION",
  "STOCK_OPNAME_NOT_FOUND",
  "STOCK_OPNAME_ITEM_NOT_FOUND",
  "INVALID_STOCK_OPNAME_STATE",
  "PHYSICAL_QUANTITY_REQUIRED",
  "INVALID_STORAGE_LOCATION",
  "FORBIDDEN",
  "DUPLICATE_SKU", "DUPLICATE_BARCODE", "DUPLICATE_CATEGORY", "DUPLICATE_SUBCATEGORY", "DUPLICATE_TAX_NAME", "DUPLICATE_TAX_RATE", "TAX_NOT_FOUND", "CATEGORY_NOT_FOUND", "SUBCATEGORY_NOT_FOUND", "CATEGORY_IN_USE", "SUBCATEGORY_IN_USE", "INVALID_CATEGORY_SUBCATEGORY", "INVALID_PRODUCT_INPUT", "INVALID_SUPPLIER", "DUPLICATE_SUPPLIER", "BASE_UNIT_MISMATCH", "PRODUCT_NOT_FOUND", "PRODUCT_INACTIVE", "EXPIRED_BATCH", "INVALID_EXPIRY", "INVALID_QUANTITY", "INVALID_COST", "PRODUCT_UNIT_NOT_FOUND", "BASE_UNIT_PROTECTED", "DUPLICATE_UNIT_NAME", "INVALID_CONVERSION", "INVALID_SELLING_PRICE", "MANUAL_RECEIVING_REQUEST_CONFLICT",
  "INVALID_INITIAL_IMPORT", "INVALID_INITIAL_IMPORT_ROW", "INITIAL_IMPORT_REQUIRES_EMPTY_PRODUCTS",
  "INITIAL_IMPORT_REQUEST_CONFLICT",
  "DUPLICATE_CUSTOMER", "CUSTOMER_NOT_FOUND", "CUSTOMER_INACTIVE", "INVALID_CUSTOMER_INPUT", "CUSTOMER_REQUEST_CONFLICT",
  "CUSTOMER_REQUIRED", "DUE_DATE_REQUIRED", "INVALID_DUE_DATE", "TEMPO_BPJS_NOT_ALLOWED", "TEMPO_ZERO_TOTAL_NOT_ALLOWED",
  "TEMPO_TRANSACTION_REQUIRES_RETURN",
  "UNAUTHORIZED_ADMIN", "RECEIVABLE_NOT_FOUND", "RECEIVABLE_ALREADY_PAID", "RECEIVABLE_OVERPAYMENT",
  "RECEIVABLE_PAYMENT_REQUEST_CONFLICT", "INVALID_RECEIVABLE_PAYMENT_INPUT", "INVALID_PAYMENT_AMOUNT",
  "INVALID_PAYMENT_METHOD", "INVALID_RECEIVABLE_FILTER",
  "RETURN_NOT_FOUND", "INVALID_RETURN_STATE", "ADMIN_NOTES_REQUIRED",
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
