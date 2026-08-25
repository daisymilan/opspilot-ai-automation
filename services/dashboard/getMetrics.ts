import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { summarizeExecutions, type ExecutionMetrics } from "@/services/executions/formatting";
import { resolveEntityNames } from "@/services/executions/entityNames";

export interface DashboardMetrics extends ExecutionMetrics {
  totalLeads: number;
  analysesCompleted: number;
}

/** Real aggregation over the caller's own org (RLS-scoped) — never a hardcoded number. */
export async function getDashboardMetrics(
  supabase: SupabaseClient<Database>,
): Promise<DashboardMetrics> {
  const [{ data: executions }, { count: totalLeads }, { count: analysesCompleted }] =
    await Promise.all([
      supabase.from("workflow_executions").select("status, duration_ms"),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("lead_scores").select("id", { count: "exact", head: true }),
    ]);

  return {
    ...summarizeExecutions(executions ?? []),
    totalLeads: totalLeads ?? 0,
    analysesCompleted: analysesCompleted ?? 0,
  };
}

export interface RecentExecution {
  id: string;
  workflow_name: string;
  entity_type: string | null;
  entity_id: string | null;
  status: Database["public"]["Tables"]["workflow_executions"]["Row"]["status"];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  retry_count: number;
  error_message: string | null;
  entityName: string | null;
}

/** No entity_type/entity_id FK exists (polymorphic by design — see Phase 1), so entity names are resolved with a second query, not a join. */
export async function getRecentExecutions(
  supabase: SupabaseClient<Database>,
  limit = 10,
): Promise<RecentExecution[]> {
  const { data: executions } = await supabase
    .from("workflow_executions")
    .select(
      "id, workflow_name, entity_type, entity_id, status, started_at, completed_at, duration_ms, retry_count, error_message",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (!executions || executions.length === 0) return [];

  const entityNames = await resolveEntityNames(supabase, executions);

  return executions.map((execution) => ({
    ...execution,
    entityName: execution.entity_id ? (entityNames.get(execution.entity_id) ?? null) : null,
  }));
}
