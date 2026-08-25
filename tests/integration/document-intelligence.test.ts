// Integration tests against a REAL local Supabase/Postgres+Storage
// instance — not mocked. Exercises the actual document-intelligence
// pipeline (services/documents/analyzeDocumentPipeline.ts), the same
// function app/api/documents/[id]/analyze calls, with the
// DeterministicTestProvider swapped in for Claude — same shape as
// tests/integration/lead-intelligence.test.ts, the second vertical on the
// same engine. The "file content" fixtures below are plain keyword text
// (not real PDF/image bytes) because DeterministicTestProvider.analyzeDocument
// decodes the uploaded bytes as UTF-8 and keyword-matches, same convention
// as its analyzeLead text matching.
//
// What this suite does NOT cover: the actual HTTP route (webhook-secret
// header handling, request parsing) and the n8n hop in front of it.
import { beforeAll, describe, expect, it } from "vitest";
import { DeterministicTestProvider } from "@/services/ai/providers/deterministicTestProvider";
import { runDocumentAnalysisPipeline } from "@/services/documents/analyzeDocumentPipeline";
import { requireLocalSupabase, requireServiceRoleClient, signInAs } from "./helpers";

beforeAll(() => {
  requireLocalSupabase();
});

async function createDocumentAndExecution(
  orgClient: Awaited<ReturnType<typeof signInAs>>,
  orgEmail: string,
  serviceRole: ReturnType<typeof requireServiceRoleClient>,
  fixtureText: string,
) {
  const { data: profile } = await orgClient
    .from("profiles")
    .select("organization_id")
    .eq("email", orgEmail)
    .single();
  if (!profile) throw new Error(`No profile found for ${orgEmail}`);

  const filePath = `${profile.organization_id}/${crypto.randomUUID()}/invoice.pdf`;
  const { error: uploadError } = await orgClient.storage
    .from("documents")
    .upload(filePath, new Blob([fixtureText], { type: "application/pdf" }));
  if (uploadError) throw new Error(`Failed to upload fixture: ${uploadError.message}`);

  const { data: document, error: documentError } = await orgClient
    .from("documents")
    .insert({
      file_path: filePath,
      file_name: "invoice.pdf",
      mime_type: "application/pdf",
      size_bytes: fixtureText.length,
    })
    .select()
    .single();
  if (documentError || !document) throw new Error(`Failed to create document: ${documentError?.message}`);

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
  if (executionError || !execution)
    throw new Error(`Failed to create execution: ${executionError?.message}`);

  return { document, executionId: execution.id };
}

describe("document intelligence pipeline", () => {
  it("persists AI extraction, records the execution, and writes audit events (low amount, no approval)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { document, executionId } = await createDocumentAndExecution(
      acme,
      "owner@acme-ops.dev",
      serviceRole,
      "ordinary invoice, nothing unusual",
    );

    const result = await runDocumentAnalysisPipeline({
      documentId: document.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(false);

    const { data: extraction } = await serviceRole
      .from("document_extractions")
      .select("*")
      .eq("document_id", document.id)
      .single();
    expect(extraction?.model).toBe("deterministic-test-provider");
    expect(extraction?.amount).toBe(250);

    const { data: updatedDocument } = await serviceRole
      .from("documents")
      .select("status")
      .eq("id", document.id)
      .single();
    expect(updatedDocument?.status).toBe("extracted");

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .select("status, completed_at, duration_ms")
      .eq("id", executionId)
      .single();
    expect(execution?.status).toBe("succeeded");
    expect(execution?.completed_at).not.toBeNull();
    expect(execution?.duration_ms).not.toBeNull();

    const { data: auditRows } = await serviceRole
      .from("audit_logs")
      .select("action")
      .eq("entity_id", document.id)
      .order("created_at", { ascending: true });
    const actions = auditRows?.map((row) => row.action) ?? [];
    expect(actions).toContain("ai_extraction.generated");
    expect(actions).toContain("document.recommendation_created");
    expect(actions).not.toContain("approval.requested");
  });

  it("creates an approval when the amount exceeds the business-rule threshold", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { document, executionId } = await createDocumentAndExecution(
      acme,
      "owner@acme-ops.dev",
      serviceRole,
      "high_amount invoice for a large purchase",
    );

    const result = await runDocumentAnalysisPipeline({
      documentId: document.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(true);

    const { data: approval } = await serviceRole
      .from("approvals")
      .select("*")
      .eq("entity_id", document.id)
      .single();
    expect(approval?.status).toBe("pending");
    expect(approval?.entity_type).toBe("document");

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .select("status")
      .eq("id", executionId)
      .single();
    expect(execution?.status).toBe("waiting_approval");
  });

  it("is idempotent: re-running the pipeline for an already-extracted document does not create a second extraction", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { document, executionId } = await createDocumentAndExecution(
      acme,
      "owner@acme-ops.dev",
      serviceRole,
      "ordinary repeat invoice",
    );

    const first = await runDocumentAnalysisPipeline({
      documentId: document.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    const { data: secondExecution } = await serviceRole
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

    const second = await runDocumentAnalysisPipeline({
      documentId: document.id,
      executionId: secondExecution!.id,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(second.documentExtractionId).toBe(first.documentExtractionId);

    const { count } = await serviceRole
      .from("document_extractions")
      .select("id", { count: "exact", head: true })
      .eq("document_id", document.id);
    expect(count).toBe(1);
  });

  it("fails the execution when the document row is missing (e.g. bad id)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { data: profile } = await acme
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@acme-ops.dev")
      .single();

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .insert({
        organization_id: profile!.organization_id,
        workflow_name: "document_intelligence",
        entity_type: "document",
        entity_id: crypto.randomUUID(),
        status: "running",
      })
      .select("id")
      .single();

    const result = await runDocumentAnalysisPipeline({
      documentId: crypto.randomUUID(),
      executionId: execution!.id,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);

    const { data: executionRow } = await serviceRole
      .from("workflow_executions")
      .select("status, error_message")
      .eq("id", execution!.id)
      .single();
    expect(executionRow?.status).toBe("failed");
    expect(executionRow?.error_message).toMatch(/not found/i);
  });

  it("does not let organization A see organization B's AI-generated document extractions", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");
    const serviceRole = requireServiceRoleClient();

    const { document: globexDocument, executionId } = await createDocumentAndExecution(
      globex,
      "owner@globex.dev",
      serviceRole,
      "globex-only invoice content",
    );
    await runDocumentAnalysisPipeline({
      documentId: globexDocument.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    const { data: acmeVisibleExtractions, error } = await acme
      .from("document_extractions")
      .select("*")
      .eq("document_id", globexDocument.id);

    expect(error).toBeNull();
    expect(acmeVisibleExtractions).toEqual([]);
  });

  it("does not let an authenticated user write document_extractions directly (service-role only)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { document } = await createDocumentAndExecution(
      acme,
      "owner@acme-ops.dev",
      requireServiceRoleClient(),
      "direct write attempt fixture",
    );

    const { error } = await acme.from("document_extractions").insert({
      document_id: document.id,
      confidence: 1,
      model: "not-real",
      prompt_version: "not-real",
    });

    expect(error).not.toBeNull();
  });

  it("does not let an authenticated user write workflow_executions directly (service-role only)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { error } = await acme.from("workflow_executions").insert({
      workflow_name: "document_intelligence",
      status: "succeeded",
    });

    expect(error).not.toBeNull();
  });
});
