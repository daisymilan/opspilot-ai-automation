import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Supabase client for Client Components. Respects RLS via the anon key + the user's session. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
