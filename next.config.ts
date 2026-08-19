import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" packages a self-contained .next/standalone output that
  // Dockerfile copies directly (see its COPY --from=builder steps) — needed
  // for Docker/local self-hosting, but incompatible with Vercel's own
  // adapter-based build pipeline for Next.js 16 (its onBuildComplete hook
  // expects the plain, non-standalone trace output). VERCEL is always set
  // by Vercel's own build/runtime environment, never locally or in Docker,
  // so this disables standalone only there — see docs/production-deployment.md.
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
