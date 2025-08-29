import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'graph.facebook.com',
      },
    ],
  },
};

export default nextConfig;
