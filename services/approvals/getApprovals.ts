import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ApprovalRow = Database["public"]["Tables"]["approvals"]["Row"];

export interface ApprovalLeadContext {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

export interface ApprovalScoreContext {
  score: number;
  priority: "low" | "medium" | "high";
  intent: string;
  confidence: number;
  reasoning_summary: string;
}

export interface ApprovalWithContext extends ApprovalRow {
  lead: ApprovalLeadContext | null;
  score: ApprovalScoreContext | null;
}

/**
 * approvals references its entity polymorphically (entity_type/entity_id,
 * no FK — see Phase 1), so lead + latest lead_score context is resolved
 * with secondary queries, not a join, same pattern as
 * services/dashboard/getMetrics.ts's getRecentExecutions.
 */
async function attachContext(
  supabase: SupabaseClient<Database>,
  approvals: ApprovalRow[],
): Promise<ApprovalWithContext[]> {
  const leadIds = approvals
    .filter((approval) => approval.entity_type === "lead")
    .map((approval) => approval.entity_id);

  if (leadIds.length === 0) {
    return approvals.map((approval) => ({ ...approval, lead: null, score: null }));
  }

  const [{ data: leads }, { data: scores }] = await Promise.all([
    supabase.from("leads").select("id, name, company, email").in("id", leadIds),
    supabase
      .from("lead_scores")
      .select("lead_id, score, priority, intent, confidence, reasoning_summary")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false }),
  ]);

  const leadMap = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  // Rows arrive newest-first, so the first one seen per lead_id is the
  // latest analysis — later duplicates for the same lead are ignored.
  const scoreMap = new Map<string, ApprovalScoreContext>();
  for (const score of scores ?? []) {
    if (!scoreMap.has(score.lead_id)) scoreMap.set(score.lead_id, score);
  }

  return approvals.map((approval) => ({
    ...approval,
    lead: approval.entity_type === "lead" ? (leadMap.get(approval.entity_id) ?? null) : null,
    score: approval.entity_type === "lead" ? (scoreMap.get(approval.entity_id) ?? null) : null,
  }));
}

export async function getPendingApprovals(
  supabase: SupabaseClient<Database>,
): Promise<ApprovalWithContext[]> {
  const { data } = await supabase
    .from("approvals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return attachContext(supabase, data ?? []);
}

export async function getRecentDecidedApprovals(
  supabase: SupabaseClient<Database>,
  limit = 10,
): Promise<ApprovalWithContext[]> {
  const { data } = await supabase
    .from("approvals")
    .select("*")
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  return attachContext(supabase, data ?? []);
}
