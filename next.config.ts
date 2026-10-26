import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: { incomingRequests: { ignore: [/^\/auth\/invite(?:\?|$)/] } },
};

export default nextConfig;
