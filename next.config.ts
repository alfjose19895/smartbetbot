import type { NextConfig } from "next";

import { applicationSecurityHeaders } from "./lib/security";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: applicationSecurityHeaders() }];
  },
};

export default nextConfig;
