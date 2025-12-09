import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://mintflavor.ddns.net:8001/scenarios/:path*', // Proxy to Backend
      },
      {
        source: '/server/scenarios/:path*',
        destination: 'https://mintflavor.ddns.net:8001/scenarios/:path*', // Proxy to Backend
      },
      {
        source: '/server/:path*',
        destination: 'https://mintflavor.ddns.net:8001/:path*', // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
