import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createLeadSchema } from "./schema";

export interface CreateLeadResult {
  data?: Database["public"]["Tables"]["leads"]["Row"];
  error?: string;
}

/**
 * Validates and inserts a lead using the caller's already-authenticated
 * Supabase client, so the insert runs under RLS as that user — never with
 * an explicit organization_id from the input (the column defaults to
 * current_org_id() at the database level; see supabase/migrations).
 */
export async function createLead(
  supabase: SupabaseClient<Database>,
  input: unknown,
): Promise<CreateLeadResult> {
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lead data" };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      company: parsed.data.company ?? null,
      source: parsed.data.source,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}
