import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveEntityNames } from "./entityNames";
import type { ExecutionStatus } from "./formatting";

type ExecutionRow = Database["public"]["Tables"]["workflow_executions"]["Row"];

export interface ExecutionListItem extends ExecutionRow {
  entityName: string | null;
}

export interface ExecutionListFilters {
  status?: ExecutionStatus;
  /** Inclusive, YYYY-MM-DD (from a native <input type="date">). */
  from?: string;
  /** Inclusive, YYYY-MM-DD. */
  to?: string;
  page: number;
  pageSize: number;
}

export interface ExecutionListResult {
  executions: ExecutionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Real filtered/paginated query — count comes from Postgres, not an estimate. */
export async function getExecutionsList(
  supabase: SupabaseClient<Database>,
  filters: ExecutionListFilters,
): Promise<ExecutionListResult> {
  const page = Math.max(1, filters.page);
  const pageSize = filters.pageSize;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = supabase
    .from("workflow_executions")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("started_at", filters.from);
  if (filters.to) query = query.lte("started_at", `${filters.to}T23:59:59.999`);

  const { data: executions, count } = await query;
  const entityNames = await resolveEntityNames(supabase, executions ?? []);

  return {
    executions: (executions ?? []).map((execution) => ({
      ...execution,
      entityName: execution.entity_id ? (entityNames.get(execution.entity_id) ?? null) : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}
