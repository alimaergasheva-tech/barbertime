import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Admin photo uploads go through Server Actions; the API itself caps images at 5 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
