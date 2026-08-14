import type { Json } from "@/types/database.types";

export function requireResultObject(data: Json): Record<string, Json | undefined> {
  if (data === null || Array.isArray(data) || typeof data !== "object") {
    throw new TypeError("Invalid RPC result shape");
  }
  return data;
}

export function resultString(data: Record<string, Json | undefined>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new TypeError(`Invalid RPC result field: ${key}`);
  return value;
}

export function resultNumber(data: Record<string, Json | undefined>, key: string): number {
  const value = data[key];
  if (typeof value !== "number") throw new TypeError(`Invalid RPC result field: ${key}`);
  return value;
}
