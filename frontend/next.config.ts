import type { NextConfig } from "next";

const API_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:3002";

const nextConfig: NextConfig = {
  async rewrites() {
    // Same-origin proxy: the browser only ever talks to the frontend origin
    // (:3001). /api/* is forwarded server-side to the API container/process so
    // there is no CORS, no extra firewall port, and no localhost-in-browser trap.
    return [
      {
        source: "/api/:path*",
        destination: `${API_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
