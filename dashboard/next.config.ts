import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-server/:path*",
        destination: "http://api:3009/:path*",
      },
    ];
  },
};

export default nextConfig;
