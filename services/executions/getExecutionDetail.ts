import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ExecutionRow = Database["public"]["Tables"]["workflow_executions"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type ApprovalRow = Database["public"]["Tables"]["approvals"]["Row"];
type LeadScoreRow = Database["public"]["Tables"]["lead_scores"]["Row"];

export interface ExecutionDetailLead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

export interface ExecutionSibling {
  id: string;
  status: ExecutionRow["status"];
  started_at: string;
  retry_count: number;
}

export interface ExecutionDetail {
  execution: ExecutionRow;
  lead: ExecutionDetailLead | null;
  score: LeadScoreRow | null;
  approval: ApprovalRow | null;
  auditEvents: AuditLogRow[];
  siblingExecutions: ExecutionSibling[];
}

export async function getExecutionDetail(
  supabase: SupabaseClient<Database>,
  executionId: string,
): Promise<ExecutionDetail | null> {
  const { data: execution } = await supabase
    .from("workflow_executions")
    .select("*")
    .eq("id", executionId)
    .single();

  if (!execution) return null;

  const entityType = execution.entity_type;
  const entityId = execution.entity_id;

  if (!entityType || !entityId) {
    return {
      execution,
      lead: null,
      score: null,
      approval: null,
      auditEvents: [],
      siblingExecutions: [],
    };
  }

  const [approvalResult, auditResult, siblingResult] = await Promise.all([
    supabase
      .from("approvals")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: true }),
    supabase
      .from("workflow_executions")
      .select("id, status, started_at, retry_count")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("started_at", { ascending: true }),
  ]);

  let lead: ExecutionDetailLead | null = null;
  let score: LeadScoreRow | null = null;
  if (entityType === "lead") {
    const [leadResult, scoreResult] = await Promise.all([
      supabase.from("leads").select("id, name, company, email").eq("id", entityId).maybeSingle(),
      supabase
        .from("lead_scores")
        .select("*")
        .eq("lead_id", entityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    lead = leadResult.data;
    score = scoreResult.data;
  }

  // An entity can have multiple executions (retries), and most audit
  // actions don't carry an executionId in their metadata, so events are
  // scoped to this execution by real timestamp — anything logged between
  // its start and completion — rather than a link that doesn't exist in
  // the data. See docs/operations-center.md#execution-timeline.
  const windowStart = execution.started_at;
  const windowEnd = execution.completed_at;
  const auditEvents = (auditResult.data ?? []).filter((event) => {
    if (event.created_at < windowStart) return false;
    if (windowEnd && event.created_at > windowEnd) return false;
    return true;
  });

  return {
    execution,
    lead,
    score,
    approval: approvalResult.data ?? null,
    auditEvents,
    siblingExecutions: (siblingResult.data ?? []).filter((sibling) => sibling.id !== execution.id),
  };
}
