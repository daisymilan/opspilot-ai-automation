import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { analyzeDocument } from "@/services/ai/analyzeDocument";
import { ClaudeProvider } from "@/services/ai/providers/claudeProvider";
import type { AIProvider } from "@/services/ai/types";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { decideDocumentAction } from "./businessRules";
import type { DocumentAnalysisInput } from "./schema";

export interface RunDocumentAnalysisPipelineParams {
  documentId: string;
  executionId: string;
  supabase: SupabaseClient<Database>;
  /** Defaults to the real Claude provider; tests inject DeterministicTestProvider. */
  provider?: AIProvider;
}

export interface RunDocumentAnalysisPipelineResult {
  success: boolean;
  documentExtractionId?: string;
  requiresApproval?: boolean;
  error?: string;
}

/**
 * The entire document-intelligence pipeline, called by
 * app/api/documents/[id]/analyze (which n8n's webhook calls into) — same
 * shape as services/leads/analyzeLeadPipeline.ts, the second vertical on
 * the same engine. See docs/document-intelligence.md.
 */
export async function runDocumentAnalysisPipeline({
  documentId,
  executionId,
  supabase,
  provider,
}: RunDocumentAnalysisPipelineParams): Promise<RunDocumentAnalysisPipelineResult> {
  const { data: execution, error: executionFetchError } = await supabase
    .from("workflow_executions")
    .select("id, organization_id, started_at")
    .eq("id", executionId)
    .single();

  if (executionFetchError || !execution) {
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

    await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);

    await recordAuditEvent(supabase, {
      organizationId: execution.organization_id,
      action: "document_intelligence.failed",
      entityType: "document",
      entityId: documentId,
      metadata: { executionId, error: message },
    });

    return { success: false, error: message };
  };

  // Fetch the document. organization_id comes from this row, never from
  // the webhook payload — the caller cannot claim a different organization.
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, organization_id, file_path, mime_type")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    return fail("Document not found");
  }

  if (document.organization_id !== execution.organization_id) {
    return fail("Document does not belong to the execution's organization");
  }

  // Idempotency: if this document already has an extraction, don't call
  // the AI again — same reasoning as analyzeLeadPipeline's duplicate check.
  const { data: existingExtraction } = await supabase
    .from("document_extractions")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingExtraction) {
    const { data: existingApproval } = await supabase
      .from("approvals")
      .select("status")
      .eq("entity_type", "document")
      .eq("entity_id", documentId)
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

    return { success: true, documentExtractionId: existingExtraction.id, requiresApproval };
  }

  await supabase.from("documents").update({ status: "analyzing" }).eq("id", documentId);

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("documents")
    .download(document.file_path);

  if (downloadError || !fileBlob) {
    return fail(
      `Failed to download document from storage: ${downloadError?.message ?? "unknown error"}`,
    );
  }

  const input: DocumentAnalysisInput = {
    data: Buffer.from(await fileBlob.arrayBuffer()).toString("base64"),
    mimeType: document.mime_type,
  };

  let aiResult;
  try {
    aiResult = await analyzeDocument(provider ?? new ClaudeProvider(), input);
  } catch (err) {
    // Covers AIConfigurationError, AIProviderError (API failure/timeout),
    // and AIOutputValidationError (invalid structured output) uniformly —
    // all are real failures of this execution, not something to paper over.
    const message = err instanceof Error ? err.message : "AI document extraction failed";
    return fail(message);
  }

  const { extraction, model, promptVersion } = aiResult;
  const decision = decideDocumentAction(extraction);

  const { data: extractionRow, error: extractionError } = await supabase
    .from("document_extractions")
    .insert({
      document_id: documentId,
      organization_id: document.organization_id,
      vendor_name: extraction.vendor_name,
      invoice_number: extraction.invoice_number,
      amount: extraction.amount,
      currency: extraction.currency,
      due_date: extraction.due_date,
      line_items: extraction.line_items,
      confidence: extraction.confidence,
      model,
      prompt_version: promptVersion,
    })
    .select("id")
    .single();

  if (extractionError || !extractionRow) {
    return fail(
      `Failed to persist document extraction: ${extractionError?.message ?? "unknown database error"}`,
    );
  }

  await recordAuditEvent(supabase, {
    organizationId: document.organization_id,
    action: "ai_extraction.generated",
    entityType: "document",
    entityId: documentId,
    metadata: { documentExtractionId: extractionRow.id, model, promptVersion, amount: extraction.amount },
  });

  await recordAuditEvent(supabase, {
    organizationId: document.organization_id,
    action: "document.recommendation_created",
    entityType: "document",
    entityId: documentId,
    metadata: { requiresApproval: decision.requiresApproval },
  });

  if (decision.requiresApproval) {
    const { error: approvalError } = await supabase.from("approvals").insert({
      organization_id: document.organization_id,
      entity_type: "document",
      entity_id: documentId,
      action_type: "review_extraction",
      requested_by: null,
    });

    if (approvalError) {
      return fail(`Failed to create approval: ${approvalError.message}`);
    }

    await recordAuditEvent(supabase, {
      organizationId: document.organization_id,
      action: "approval.requested",
      entityType: "document",
      entityId: documentId,
      metadata: { actionType: "review_extraction", reason: decision.reason },
    });
  }

  await supabase.from("documents").update({ status: "extracted" }).eq("id", documentId);

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
    documentExtractionId: extractionRow.id,
    requiresApproval: decision.requiresApproval,
  };
}
