export const AUTH_ERROR_CODES = [
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMPLOYEE_NOT_FOUND",
  "EMPLOYEE_INACTIVE",
  "FORBIDDEN",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthApplicationError extends Error {
  readonly name = "AuthApplicationError";

  constructor(public readonly code: AuthErrorCode) {
    super(code);
  }
}

export function isAuthApplicationError(error: unknown): error is AuthApplicationError {
  return error instanceof AuthApplicationError;
}
