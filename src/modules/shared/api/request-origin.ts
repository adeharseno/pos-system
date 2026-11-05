import "server-only";

const loopbackAliases = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopback(origin: string): boolean {
  try {
    return loopbackAliases.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Validates browser mutations against the configured application origins.
 *
 * Next's `request.url` can resolve to a different loopback alias than the one
 * the browser used (for example localhost vs 127.0.0.1). Trusted origins are
 * therefore read from APP_SITE_URL and APP_ADDITIONAL_ORIGINS, with the request
 * URL kept as a fallback.
 */
export function requestOriginAllowed(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true;

  const allowed = new Set<string>();
  const configured = [process.env.APP_SITE_URL, ...(process.env.APP_ADDITIONAL_ORIGINS ?? "").split(",")];
  for (const value of configured) {
    const resolved = originOf(value?.trim());
    if (resolved) allowed.add(resolved);
  }
  const requestOrigin = originOf(requestUrl);
  if (requestOrigin) allowed.add(requestOrigin);

  if (allowed.has(origin)) return true;

  // Local development may be opened through either loopback hostname.
  return process.env.NODE_ENV !== "production" && isLoopback(origin) &&
    [...allowed].some((value) => isLoopback(value));
}
