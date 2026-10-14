import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Security headers for every page (docs/security/hardening-2026-10.md). A baseline CSP: no
 * framing, plugins or <base> hijacking, and forms only submit here or to the Entra External ID
 * sign-in host (sign-in / sign-out redirect there). A strict script nonce CSP needs every page
 * rendered per request (conflicts with Cache Components) - tracked in OUTSTANDING.
 */
const isProduction = process.env.NODE_ENV === "production";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.ciamlogin.com" },
  ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Self-contained server for the container image (Dockerfile target "web"); traced from the
  // monorepo root so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  cacheComponents: true,
  partialPrefetching: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  images: {
    // Default sizes plus 448: the hero mascot shows at ~255 CSS px (~450 device px on phones) and
    // otherwise jumped to the 640 px file (Landing 23 - Lighthouse "properly size images").
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 448],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
