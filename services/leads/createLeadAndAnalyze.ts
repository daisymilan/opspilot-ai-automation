import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { triggerLeadIntelligenceWorkflow } from "@/services/n8n/triggerWorkflow";
import { createLead } from "./createLead";

export interface CreateLeadAndAnalyzeResult {
  lead?: Database["public"]["Tables"]["leads"]["Row"];
  executionId?: string;
  analysisTriggered: boolean;
  analysisError?: string;
  error?: string;
}

/**
 * Create Lead -> Persist Lead -> Trigger n8n, the entry point to the
 * lead-intelligence vertical slice. Lead creation itself runs under the
 * caller's own session (RLS-respecting, via `supabase`); starting the
 * execution record and triggering n8n use the service role, since
 * workflow_executions is service-role-write-only by design (see
 * supabase/migrations) even when the caller is an authenticated user.
 *
 * If n8n is unreachable or misconfigured, the lead is still created (that
 * part already succeeded) but the failure is recorded on the execution
 * and returned to the caller — never silently dropped.
 */
export async function createLeadAndAnalyze(
  supabase: SupabaseClient<Database>,
  input: unknown,
  actorId: string | null,
): Promise<CreateLeadAndAnalyzeResult> {
  const createResult = await createLead(supabase, input);
  if (createResult.error || !createResult.data) {
    return { analysisTriggered: false, error: createResult.error ?? "Failed to create lead" };
  }

  const lead = createResult.data;
  const serviceRole = createServiceRoleClient();

  await recordAuditEvent(serviceRole, {
    organizationId: lead.organization_id,
    actorId,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    metadata: { source: lead.source },
  });

  const { data: execution, error: executionError } = await serviceRole
    .from("workflow_executions")
    .insert({
      organization_id: lead.organization_id,
      workflow_name: "lead_intelligence",
      entity_type: "lead",
      entity_id: lead.id,
      status: "running",
    })
    .select("id")
    .single();

  if (executionError || !execution) {
    return {
      lead,
      analysisTriggered: false,
      error: `Lead created, but failed to start analysis tracking: ${executionError?.message ?? "unknown error"}`,
    };
  }

  try {
    await triggerLeadIntelligenceWorkflow({
      leadId: lead.id,
      executionId: execution.id,
      organizationId: lead.organization_id,
    });
    return { lead, executionId: execution.id, analysisTriggered: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to trigger the lead analysis workflow";
    await serviceRole
      .from("workflow_executions")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", execution.id);
    return { lead, executionId: execution.id, analysisTriggered: false, analysisError: message };
  }
}
