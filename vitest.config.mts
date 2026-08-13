import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Vitest does not auto-load .env.local the way Next.js's dev/build pipeline
// does, so integration tests would otherwise never see
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY even when .env.local is correctly set
// up. Reuse Vite's own env loader (no extra dependency) so both `next dev`
// and `vitest` read the same single source of truth.
const env = loadEnv("", process.cwd(), "");

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // The `server-only` package throws unless the bundler sets Next.js's
      // "react-server" export condition — correct in Next's own build (it's
      // what stops server-only code from reaching the browser), but Vitest
      // isn't that bundler, so testing server-only modules directly under
      // Node (a legitimate server context) would otherwise always crash.
      // Point it at the package's own empty "react-server" build instead of
      // loosening the guard itself.
      "server-only": path.resolve(process.cwd(), "node_modules/server-only/empty.js"),
    },
  },
  test: {
    env,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 20000,
        },
      },
    ],
  },
});
