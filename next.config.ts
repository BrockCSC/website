import type { NextConfig } from "next";

/**
 * `frame-ancestors`/`object-src`/`base-uri` are the parts of a CSP this app can
 * assert without a nonce pipeline; script-src is deliberately left out rather
 * than shipped as a permissive rule that only looks like a control.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "drizzle-orm"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
