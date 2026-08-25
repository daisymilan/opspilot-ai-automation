import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { triggerDocumentIntelligenceWorkflow } from "./triggerDocumentWorkflow";
import { uploadDocument } from "./uploadDocument";

export interface CreateDocumentAndAnalyzeResult {
  document?: Database["public"]["Tables"]["documents"]["Row"];
  executionId?: string;
  analysisTriggered: boolean;
  analysisError?: string;
  error?: string;
}

/**
 * Upload Document -> Persist Document -> Trigger n8n, the entry point to
 * the document-intelligence vertical slice. Mirrors
 * services/leads/createLeadAndAnalyze.ts exactly. `organizationId` is
 * needed up front (unlike createLead, where the DB defaults it) because
 * the storage path's org-scoped prefix must be known before the upload
 * call — see services/documents/uploadDocument.ts and the storage RLS
 * policy in supabase/migrations.
 */
export async function createDocumentAndAnalyze(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  actorId: string | null,
  input: unknown,
): Promise<CreateDocumentAndAnalyzeResult> {
  const uploadResult = await uploadDocument(supabase, organizationId, actorId, input);
  if (uploadResult.error || !uploadResult.data) {
    return { analysisTriggered: false, error: uploadResult.error ?? "Failed to upload document" };
  }

  const document = uploadResult.data;
  const serviceRole = createServiceRoleClient();

  await recordAuditEvent(serviceRole, {
    organizationId: document.organization_id,
    actorId,
    action: "document.uploaded",
    entityType: "document",
    entityId: document.id,
    metadata: { fileName: document.file_name, mimeType: document.mime_type },
  });

  const { data: execution, error: executionError } = await serviceRole
    .from("workflow_executions")
    .insert({
      organization_id: document.organization_id,
      workflow_name: "document_intelligence",
      entity_type: "document",
      entity_id: document.id,
      status: "running",
    })
    .select("id")
    .single();

  if (executionError || !execution) {
    return {
      document,
      analysisTriggered: false,
      error: `Document uploaded, but failed to start analysis tracking: ${executionError?.message ?? "unknown error"}`,
    };
  }

  try {
    await triggerDocumentIntelligenceWorkflow({
      documentId: document.id,
      executionId: execution.id,
      organizationId: document.organization_id,
    });
    return { document, executionId: execution.id, analysisTriggered: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to trigger the document analysis workflow";
    await serviceRole
      .from("workflow_executions")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", execution.id);
    return { document, executionId: execution.id, analysisTriggered: false, analysisError: message };
  }
}
