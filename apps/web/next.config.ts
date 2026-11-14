/**
 * The web app's build (SDD §3.23; E13.1).
 *
 * Two things here are load-bearing. The **headers** are T31's answer to a browser compromise: a
 * strict CSP with no third-party script, because this page holds a seller's plaintext before it is
 * sealed. And `transpilePackages` covers the workspace packages, which ship TypeScript sources
 * rather than a build.
 *
 * `@marginal/core-wasm` loads `core.wasm` with `node:fs` at module scope, so it is a **server-only**
 * dependency: it is listed in `serverExternalPackages` and imported only from route handlers.
 */
import type { NextConfig } from "next";

/** Where the browser may talk: its own origin, and the chain RPC the manifest names. */
const rpc = process.env.MARGINAL_RPC_URL ?? "https://test.rpc.fastnear.com";
const wallets = "https://testnet.mynearwallet.com https://wallet.meteorwallet.app";

const csp = [
  "default-src 'self'",
  // Next's runtime needs inline styles and, in dev, eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${rpc} ${wallets}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // `@marginal/sdk`'s crypto runs in the browser, so it is bundled. The verifier and the core
  // wasm are server-only and must stay **external**: `core.wasm` is loaded with `node:fs` relative
  // to its own file, which a bundle would move out from under it.
  transpilePackages: ["@marginal/sdk"],
  serverExternalPackages: ["@marginal/core-wasm", "@marginal/replay-ts"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
