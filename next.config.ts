import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/server/scenarios/",
        destination: "https://mintflavor.ddns.net:8001/scenarios/",
      },
      {
        source: "/server/scenarios/:id",
        destination: "https://mintflavor.ddns.net:8001/scenarios/:id",
      },
      {
        source: "/server/:path*",
        destination: "https://mintflavor.ddns.net:8001/:path*",
      },
    ];
  },
};

export default nextConfig;
