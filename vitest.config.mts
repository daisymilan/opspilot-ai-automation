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
