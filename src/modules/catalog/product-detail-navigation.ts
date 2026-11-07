export function isSafeProductReturnReferrer(referrer: string, origin: string) {
  try {
    const url = new URL(referrer);
    return url.origin === origin && (url.pathname === "/products" || url.pathname === "/inventory");
  } catch {
    return false;
  }
}
