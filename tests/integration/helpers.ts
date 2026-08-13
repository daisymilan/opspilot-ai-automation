// Shared setup for integration tests that run against a REAL local
// Supabase/Postgres instance — not mocked. See tests/README.md for the
// prerequisites (Docker, `db:start`, `db:reset`, env vars).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const DEMO_PASSWORD = "DemoPass123!";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requireLocalSupabase(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Integration tests require a running local Supabase instance.\n" +
        "Run: npm run db:start (requires Docker) && npm run db:reset\n" +
        "Then set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "(values are printed by db:start) before running npm run test:integration.",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export function anonClient(): SupabaseClient<Database> {
  const { url, anonKey } = requireLocalSupabase();
  return createClient<Database>(url, anonKey);
}

export async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) {
    throw new Error(
      `Failed to sign in as ${email}: ${error.message}. Did you run \`npm run db:reset\`?`,
    );
  }
  return client;
}

/**
 * Simulates the trusted backend code path (what
 * services/leads/analyzeLeadPipeline.ts runs with in production) —
 * bypasses RLS entirely, same as lib/supabase/serviceRole.ts.
 */
export function requireServiceRoleClient(): SupabaseClient<Database> {
  const { url } = requireLocalSupabase();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set to run tests that simulate the trusted backend " +
        "pipeline. The value is printed by `npm run db:start` — see .env.example.",
    );
  }
  return createClient<Database>(url, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
