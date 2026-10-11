import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const SECURITY_CSP = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";
const SECURITY_CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
].join("; ");

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
  outputFileTracingIncludes: { "/api/work/*": ["./assets/fonts/*.ttf"], "/api/os/artifacts/*/export": ["./assets/fonts/*.ttf"] },
  // Optional local verification on disk-constrained worktrees; normal deploys keep caching.
  webpack(config) {
    if (process.env.MALIK_BUILD_NO_CACHE === "1") config.cache = false;
    return config;
  },
  async headers() {
    return [{
      // Security baseline for every page and route. Enforced: nothing that
      // the app itself uses (no framing by other sites, no plugins, no
      // <base> hijack, no MIME sniffing). The full policy is report-only
      // first, so a missed source shows in the console instead of breaking.
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: SECURITY_CSP },
        { key: "Content-Security-Policy-Report-Only", value: SECURITY_CSP_REPORT_ONLY },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=()" },
      ],
    }, {
      source: "/reference-photos/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }, {
      source: "/images/malik-mobile-cinematic-v2.webp",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
