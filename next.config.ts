import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow a 10 MB invoice plus multipart metadata through the session proxy.
  experimental: { proxyClientMaxBodySize: "11mb" },
  logging: { incomingRequests: { ignore: [/^\/auth\/invite(?:\?|$)/] } },
};

export default nextConfig;
