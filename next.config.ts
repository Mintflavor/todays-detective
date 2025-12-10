import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/scenarios/:path*`, // Proxy to Backend
      },
      {
        source: '/server/scenarios/:path*',
        destination: `${API_URL}/scenarios/:path*`, // Proxy to Backend
      },
      {
        source: '/server/:path*',
        destination: `${API_URL}/:path*`, // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;