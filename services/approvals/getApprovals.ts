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

export interface ApprovalDocumentContext {
  id: string;
  file_name: string;
}

export interface ApprovalExtractionContext {
  vendor_name: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
}

export interface ApprovalWithContext extends ApprovalRow {
  lead: ApprovalLeadContext | null;
  score: ApprovalScoreContext | null;
  document: ApprovalDocumentContext | null;
  extraction: ApprovalExtractionContext | null;
}

/**
 * approvals references its entity polymorphically (entity_type/entity_id,
 * no FK — see Phase 1), so entity + latest AI-output context is resolved
 * with secondary queries, not a join, same pattern as
 * services/dashboard/getMetrics.ts's getRecentExecutions. One vertical per
 * entity_type value found among the approvals — a lead approval never pays
 * for a document query and vice versa.
 */
async function attachContext(
  supabase: SupabaseClient<Database>,
  approvals: ApprovalRow[],
): Promise<ApprovalWithContext[]> {
  const leadIds = approvals
    .filter((approval) => approval.entity_type === "lead")
    .map((approval) => approval.entity_id);
  const documentIds = approvals
    .filter((approval) => approval.entity_type === "document")
    .map((approval) => approval.entity_id);

  const [{ data: leads }, { data: scores }, { data: documents }, { data: extractions }] =
    await Promise.all([
      leadIds.length > 0
        ? supabase.from("leads").select("id, name, company, email").in("id", leadIds)
        : Promise.resolve({ data: [] as ApprovalLeadContext[] }),
      leadIds.length > 0
        ? supabase
            .from("lead_scores")
            .select("lead_id, score, priority, intent, confidence, reasoning_summary")
            .in("lead_id", leadIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as (ApprovalScoreContext & { lead_id: string })[] }),
      documentIds.length > 0
        ? supabase.from("documents").select("id, file_name").in("id", documentIds)
        : Promise.resolve({ data: [] as ApprovalDocumentContext[] }),
      documentIds.length > 0
        ? supabase
            .from("document_extractions")
            .select("document_id, vendor_name, amount, currency, confidence, created_at")
            .in("document_id", documentIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({
            data: [] as (ApprovalExtractionContext & { document_id: string })[],
          }),
    ]);

  const leadMap = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  const documentMap = new Map((documents ?? []).map((document) => [document.id, document]));

  // Rows arrive newest-first, so the first one seen per id is the latest
  // analysis/extraction — later duplicates for the same entity are ignored.
  const scoreMap = new Map<string, ApprovalScoreContext>();
  for (const score of scores ?? []) {
    if (!scoreMap.has(score.lead_id)) scoreMap.set(score.lead_id, score);
  }
  const extractionMap = new Map<string, ApprovalExtractionContext>();
  for (const extraction of extractions ?? []) {
    if (!extractionMap.has(extraction.document_id)) {
      extractionMap.set(extraction.document_id, extraction);
    }
  }

  return approvals.map((approval) => ({
    ...approval,
    lead: approval.entity_type === "lead" ? (leadMap.get(approval.entity_id) ?? null) : null,
    score: approval.entity_type === "lead" ? (scoreMap.get(approval.entity_id) ?? null) : null,
    document:
      approval.entity_type === "document" ? (documentMap.get(approval.entity_id) ?? null) : null,
    extraction:
      approval.entity_type === "document"
        ? (extractionMap.get(approval.entity_id) ?? null)
        : null,
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
