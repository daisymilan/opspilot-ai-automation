import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

interface HasEntity {
  entity_type: string | null;
  entity_id: string | null;
}

/**
 * workflow_executions references its entity polymorphically (no FK — see
 * Phase 1), so a human-readable label is resolved with a second query per
 * entity type, not a join. Shared by the dashboard's recent-executions
 * widget and the full executions list so both stay consistent. One
 * function across verticals (lead name, document file name) rather than
 * one per entity type — callers don't need to know which entity types
 * exist to get a usable label back.
 */
export async function resolveEntityNames<T extends HasEntity>(
  supabase: SupabaseClient<Database>,
  rows: T[],
): Promise<Map<string, string>> {
  const leadIds = rows
    .filter((row) => row.entity_type === "lead" && row.entity_id)
    .map((row) => row.entity_id as string);
  const documentIds = rows
    .filter((row) => row.entity_type === "document" && row.entity_id)
    .map((row) => row.entity_id as string);

  const [{ data: leads }, { data: documents }] = await Promise.all([
    leadIds.length > 0
      ? supabase.from("leads").select("id, name").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    documentIds.length > 0
      ? supabase.from("documents").select("id, file_name").in("id", documentIds)
      : Promise.resolve({ data: [] as { id: string; file_name: string }[] }),
  ]);

  const names = new Map<string, string>();
  for (const lead of leads ?? []) names.set(lead.id, lead.name);
  for (const document of documents ?? []) names.set(document.id, document.file_name);
  return names;
}
