import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

interface HasEntity {
  entity_type: string | null;
  entity_id: string | null;
}

/**
 * workflow_executions references its entity polymorphically (no FK — see
 * Phase 1), so lead names are resolved with a second query, not a join.
 * Shared by the dashboard's recent-executions widget and the full
 * executions list so both stay consistent.
 */
export async function resolveLeadNames<T extends HasEntity>(
  supabase: SupabaseClient<Database>,
  rows: T[],
): Promise<Map<string, string>> {
  const leadIds = rows
    .filter((row) => row.entity_type === "lead" && row.entity_id)
    .map((row) => row.entity_id as string);

  if (leadIds.length === 0) return new Map();

  const { data: leads } = await supabase.from("leads").select("id, name").in("id", leadIds);
  return new Map((leads ?? []).map((lead) => [lead.id, lead.name]));
}
