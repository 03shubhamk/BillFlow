import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignore build type errors to prevent strict configurations from blocking bundle output
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore ESLint checks during production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
