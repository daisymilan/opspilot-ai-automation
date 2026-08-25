"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { triggerLeadIntelligenceWorkflow } from "@/services/n8n/triggerWorkflow";
import { triggerDocumentIntelligenceWorkflow } from "@/services/documents/triggerDocumentWorkflow";
import { canRetryExecution, computeNextRetryCount } from "./retryRules";

export interface RetryActionState {
  error?: string;
}

/**
 * Creates a NEW execution row and re-triggers the same real pipeline used
 * at creation time (lead or document, by `workflow_name`) — it never
 * touches the original failed row (preserved as history) and is only
 * reachable for status='failed' (see services/executions/retryRules.ts),
 * so it can never duplicate a lead/document, an AI result, or an approval,
 * or overwrite a waiting_approval/succeeded execution. See
 * docs/operations-center.md#retry.
 */
export async function retryExecutionAction(
  _prevState: RetryActionState,
  formData: FormData,
): Promise<RetryActionState> {
  const executionId = formData.get("executionId");
  if (typeof executionId !== "string" || executionId.length === 0) {
    return { error: "Invalid request" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // RLS-scoped read — a cross-organization execution id simply isn't
  // found, the same tenant-isolation pattern as /leads/[id].
  const { data: execution } = await supabase
    .from("workflow_executions")
    .select("id, organization_id, workflow_name, entity_type, entity_id, status, retry_count")
    .eq("id", executionId)
    .single();

  if (!execution) return { error: "Execution not found" };
  if (!canRetryExecution(execution)) {
    return { error: "Only failed executions can be retried" };
  }
  if (!execution.entity_id || !execution.entity_type) {
    return { error: "This execution has no associated entity to retry" };
  }

  const serviceRole = createServiceRoleClient();
  const nextRetryCount = computeNextRetryCount(execution.retry_count);

  const { data: newExecution, error: insertError } = await serviceRole
    .from("workflow_executions")
    .insert({
      organization_id: execution.organization_id,
      workflow_name: execution.workflow_name,
      entity_type: execution.entity_type,
      entity_id: execution.entity_id,
      status: "running",
      retry_count: nextRetryCount,
    })
    .select("id")
    .single();

  if (insertError || !newExecution) {
    return { error: "Failed to start the retry" };
  }

  await recordAuditEvent(serviceRole, {
    organizationId: execution.organization_id,
    actorId: user.id,
    action: "execution.retried",
    entityType: execution.entity_type,
    entityId: execution.entity_id,
    metadata: {
      originalExecutionId: execution.id,
      newExecutionId: newExecution.id,
      attempt: nextRetryCount,
    },
  });

  // Retry is scoped to workflows that are actually wired up to be
  // re-triggered, not a generic "rerun anything" button that would
  // silently do nothing for an unrecognized name.
  try {
    if (execution.workflow_name === "lead_intelligence") {
      await triggerLeadIntelligenceWorkflow({
        leadId: execution.entity_id,
        executionId: newExecution.id,
        organizationId: execution.organization_id,
      });
    } else if (execution.workflow_name === "document_intelligence") {
      await triggerDocumentIntelligenceWorkflow({
        documentId: execution.entity_id,
        executionId: newExecution.id,
        organizationId: execution.organization_id,
      });
    } else {
      throw new Error(`Retry is not implemented for workflow "${execution.workflow_name}"`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to trigger the retry";
    await serviceRole
      .from("workflow_executions")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", newExecution.id);
    return { error: message };
  }

  revalidatePath("/executions");
  revalidatePath(`/executions/${execution.id}`);
  revalidatePath("/dashboard");
  redirect(`/executions/${newExecution.id}`);
}
