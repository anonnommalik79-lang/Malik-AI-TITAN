import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OAuth callbacks and server routes require a Node deployment.
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // Optional local verification on disk-constrained worktrees; normal deploys keep caching.
  webpack(config) {
    if (process.env.MALIK_BUILD_NO_CACHE === "1") config.cache = false;
    return config;
  },
  async headers() {
    return [{
      source: "/images/malik-mobile-cinematic-v2.webp",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
