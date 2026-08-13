import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Bypasses RLS entirely. Only for trusted backend code paths that have no
 * user session to operate under (the lead-analysis pipeline, invoked via
 * webhook secret, not a browser session) or that write to tables Phase 1/2
 * deliberately made service-role-only (workflow_executions, lead_scores,
 * audit_logs) even from server-side code acting on a user's behalf.
 *
 * The `server-only` import makes this throw a build error if anything ever
 * tries to bundle it into client code — it must never reach the browser.
 *
 * Never call this for anything a browser session could legitimately do;
 * use lib/supabase/server.ts (RLS-respecting) for that.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set to use the service-role " +
        "client. See .env.example — for local dev, get the value from `npm run db:start` output.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
