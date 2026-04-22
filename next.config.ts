import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'todays-detective.s3.ap-northeast-2.amazonaws.com',
      },
    ],
  },
  async rewrites() {
    return [
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