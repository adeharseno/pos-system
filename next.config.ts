import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev assets are requested from both localhost and 127.0.0.1 during local testing.
  allowedDevOrigins: ["127.0.0.1"],
  // Allow a 10 MB invoice plus multipart metadata through the session proxy.
  experimental: { proxyClientMaxBodySize: "11mb" },
  logging: { incomingRequests: { ignore: [/^\/auth\/invite(?:\?|$)/] } },
};

export default nextConfig;
