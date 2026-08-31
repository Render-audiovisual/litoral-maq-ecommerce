import type { NextConfig } from "next";
import path from "node:path";

const allowLocalAdapter = process.env.ALLOW_LOCAL_ADAPTER !== "false";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
    resolveAlias: allowLocalAdapter
      ? {}
      : {
          "@/services/auth/local-auth-adapter": "./src/services/auth/disabled-local-auth-adapter.ts",
          "@/services/persistence/local-adapter": "./src/services/persistence/disabled-local-adapter.ts",
        },
  },
  webpack(config) {
    if (!allowLocalAdapter) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/services/auth/local-auth-adapter": path.resolve(
          process.cwd(),
          "src/services/auth/disabled-local-auth-adapter.ts",
        ),
        "@/services/persistence/local-adapter": path.resolve(
          process.cwd(),
          "src/services/persistence/disabled-local-adapter.ts",
        ),
      };
    }
    return config;
  },
};

export default nextConfig;
