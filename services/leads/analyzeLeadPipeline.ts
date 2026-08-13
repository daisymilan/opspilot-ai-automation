import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { analyzeLead } from "@/services/ai/analyzeLead";
import { ClaudeProvider } from "@/services/ai/providers/claudeProvider";
import type { LeadAnalysisInput } from "@/services/ai/schema";
import type { AIProvider } from "@/services/ai/types";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { decideAction } from "./businessRules";

export interface RunLeadAnalysisPipelineParams {
  leadId: string;
  executionId: string;
  supabase: SupabaseClient<Database>;
  /** Defaults to the real Claude provider; tests inject DeterministicTestProvider. */
  provider?: AIProvider;
}

export interface RunLeadAnalysisPipelineResult {
  success: boolean;
  leadScoreId?: string;
  requiresApproval?: boolean;
  recommendedAction?: string;
  error?: string;
}

/**
 * The entire lead-intelligence pipeline, called by app/api/leads/[id]/analyze
 * (which n8n's webhook calls into). This is the single place the business
 * logic lives — n8n orchestrates around this call, it does not
 * reimplement any of it. See docs/lead-intelligence.md.
 */
export async function runLeadAnalysisPipeline({
  leadId,
  executionId,
  supabase,
  provider,
}: RunLeadAnalysisPipelineParams): Promise<RunLeadAnalysisPipelineResult> {
  const { data: execution, error: executionFetchError } = await supabase
    .from("workflow_executions")
    .select("id, organization_id, started_at")
    .eq("id", executionId)
    .single();

  if (executionFetchError || !execution) {
    // Nothing to update — report failure without touching the DB further.
    return { success: false, error: "Execution record not found" };
  }

  const fail = async (message: string) => {
    await supabase
      .from("workflow_executions")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(execution.started_at).getTime(),
      })
      .eq("id", executionId);
    return { success: false, error: message };
  };

  // Fetch the lead. organization_id comes from this row, never from the
  // webhook payload — the caller cannot claim a different organization.
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, organization_id, name, email, company, message, source")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return fail("Lead not found");
  }

  if (lead.organization_id !== execution.organization_id) {
    return fail("Lead does not belong to the execution's organization");
  }

  // Idempotency: if this lead already has an analysis, don't call the AI
  // again. Protects against a retried/duplicated webhook producing two
  // different "AI opinions" (or paying for the call twice).
  const { data: existingScore } = await supabase
    .from("lead_scores")
    .select("id, recommended_action")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingScore) {
    // Reflect the lead's true current state, not an assumed one: if the
    // original analysis required approval and that approval is still
    // pending, a retried/duplicated webhook must not report this
    // execution as a plain "succeeded" — that would be observably false
    // execution data (see Phase 2 requirement: never fake execution data).
    const { data: existingApproval } = await supabase
      .from("approvals")
      .select("status")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const requiresApproval = existingApproval?.status === "pending";

    await supabase
      .from("workflow_executions")
      .update({
        status: requiresApproval ? "waiting_approval" : "succeeded",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(execution.started_at).getTime(),
      })
      .eq("id", executionId);
    return {
      success: true,
      leadScoreId: existingScore.id,
      recommendedAction: existingScore.recommended_action,
      requiresApproval,
    };
  }

  const input: LeadAnalysisInput = {
    name: lead.name,
    company: lead.company,
    email: lead.email,
    source: lead.source,
    message: lead.message,
  };

  let aiResult;
  try {
    aiResult = await analyzeLead(provider ?? new ClaudeProvider(), input);
  } catch (err) {
    // Covers AIConfigurationError, AIProviderError (API failure/timeout),
    // and AIOutputValidationError (invalid structured output) uniformly —
    // all are real failures of this execution, not something to paper over.
    const message = err instanceof Error ? err.message : "AI analysis failed";
    return fail(message);
  }

  const { analysis, model, promptVersion } = aiResult;
  const decision = decideAction(analysis);

  const { data: scoreRow, error: scoreError } = await supabase
    .from("lead_scores")
    .insert({
      lead_id: leadId,
      organization_id: lead.organization_id,
      score: analysis.score,
      priority: analysis.priority,
      intent: analysis.intent,
      industry: analysis.industry,
      confidence: analysis.confidence,
      recommended_action: analysis.recommended_action,
      reasoning_summary: analysis.reasoning_summary,
      model,
      prompt_version: promptVersion,
    })
    .select("id")
    .single();

  if (scoreError || !scoreRow) {
    return fail(
      `Failed to persist lead analysis: ${scoreError?.message ?? "unknown database error"}`,
    );
  }

  await recordAuditEvent(supabase, {
    organizationId: lead.organization_id,
    action: "ai_analysis.generated",
    entityType: "lead",
    entityId: leadId,
    metadata: { leadScoreId: scoreRow.id, model, promptVersion, score: analysis.score },
  });

  await recordAuditEvent(supabase, {
    organizationId: lead.organization_id,
    action: "lead.recommendation_created",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      recommendedAction: decision.recommendedAction,
      requiresApproval: decision.requiresApproval,
    },
  });

  if (decision.requiresApproval) {
    const { error: approvalError } = await supabase.from("approvals").insert({
      organization_id: lead.organization_id,
      entity_type: "lead",
      entity_id: leadId,
      action_type: decision.recommendedAction,
      requested_by: null,
    });

    if (approvalError) {
      return fail(`Failed to create approval: ${approvalError.message}`);
    }

    await recordAuditEvent(supabase, {
      organizationId: lead.organization_id,
      action: "approval.requested",
      entityType: "lead",
      entityId: leadId,
      metadata: { actionType: decision.recommendedAction, reason: decision.reason },
    });
  }

  await supabase
    .from("workflow_executions")
    .update({
      status: decision.requiresApproval ? "waiting_approval" : "succeeded",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(execution.started_at).getTime(),
    })
    .eq("id", executionId);

  return {
    success: true,
    leadScoreId: scoreRow.id,
    requiresApproval: decision.requiresApproval,
    recommendedAction: decision.recommendedAction,
  };
}
