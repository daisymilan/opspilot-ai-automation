// Integration tests against a REAL local Supabase/Postgres instance — not
// mocked. Exercises the actual lead-intelligence pipeline
// (services/leads/analyzeLeadPipeline.ts), the same function
// app/api/leads/[id]/analyze calls, with the DeterministicTestProvider
// swapped in for Claude (see services/ai/providers) so this needs no
// ANTHROPIC_API_KEY or network call — only the AI call is substituted,
// nothing about the database interaction is mocked.
//
// What this suite does NOT cover: the actual HTTP route (webhook-secret
// header handling, request parsing) and the n8n hop in front of it — see
// docs/lead-intelligence.md for what remains manually-verified-only.
import { beforeAll, describe, expect, it } from "vitest";
import { DeterministicTestProvider } from "@/services/ai/providers/deterministicTestProvider";
import { runLeadAnalysisPipeline } from "@/services/leads/analyzeLeadPipeline";
import { requireLocalSupabase, requireServiceRoleClient, signInAs } from "./helpers";

beforeAll(() => {
  requireLocalSupabase();
});

async function createLeadAndExecution(
  orgClient: Awaited<ReturnType<typeof signInAs>>,
  serviceRole: ReturnType<typeof requireServiceRoleClient>,
  overrides: { name: string; message?: string; company?: string },
) {
  const { data: lead, error: leadError } = await orgClient
    .from("leads")
    .insert({
      name: overrides.name,
      message: overrides.message ?? null,
      company: overrides.company ?? null,
    })
    .select()
    .single();
  if (leadError || !lead) throw new Error(`Failed to create lead: ${leadError?.message}`);

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
  if (executionError || !execution)
    throw new Error(`Failed to create execution: ${executionError?.message}`);

  return { lead, executionId: execution.id };
}

describe("lead intelligence pipeline", () => {
  it("persists AI analysis, records the execution, and writes audit events (low-risk action, no approval)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { lead, executionId } = await createLeadAndExecution(acme, serviceRole, {
      name: "Low Intent Lead",
      message: "Just browsing, thanks.",
    });

    const result = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.recommendedAction).toBe("send_follow_up");

    const { data: score } = await serviceRole
      .from("lead_scores")
      .select("*")
      .eq("lead_id", lead.id)
      .single();
    expect(score?.model).toBe("deterministic-test-provider");
    expect(score?.recommended_action).toBe("send_follow_up");

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
      .eq("entity_id", lead.id)
      .order("created_at", { ascending: true });
    const actions = auditRows?.map((row) => row.action) ?? [];
    expect(actions).toContain("ai_analysis.generated");
    expect(actions).toContain("lead.recommendation_created");
    expect(actions).not.toContain("approval.requested");
  });

  it("creates an approval when the business rules require human review", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { lead, executionId } = await createLeadAndExecution(acme, serviceRole, {
      name: "High Intent Lead",
      message: "We need to automate this urgently.",
    });

    const result = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.recommendedAction).toBe("schedule_call");

    const { data: approval } = await serviceRole
      .from("approvals")
      .select("*")
      .eq("entity_id", lead.id)
      .single();
    expect(approval?.status).toBe("pending");
    expect(approval?.action_type).toBe("schedule_call");

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .select("status")
      .eq("id", executionId)
      .single();
    expect(execution?.status).toBe("waiting_approval");

    const { data: auditRows } = await serviceRole
      .from("audit_logs")
      .select("action")
      .eq("entity_id", lead.id);
    expect(auditRows?.map((row) => row.action)).toContain("approval.requested");
  });

  it("is idempotent: re-running the pipeline for an already-analyzed lead does not create a second analysis", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { lead, executionId } = await createLeadAndExecution(acme, serviceRole, {
      name: "Idempotency Test Lead",
      message: "General question.",
    });

    const first = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    const { data: secondExecution } = await serviceRole
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

    const second = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId: secondExecution!.id,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(second.leadScoreId).toBe(first.leadScoreId);

    const { count } = await serviceRole
      .from("lead_scores")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id);
    expect(count).toBe(1);
  });

  it("regression: an idempotent re-run of an already-approval-pending lead reports waiting_approval, not a false succeeded", async () => {
    // A retried/duplicated webhook for a lead whose first analysis required
    // approval must not report the second execution as a plain "succeeded"
    // with requiresApproval:false — that would be fake execution data. See
    // the fix in services/leads/analyzeLeadPipeline.ts.
    const acme = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();

    const { lead, executionId } = await createLeadAndExecution(acme, serviceRole, {
      name: "Idempotent Approval Retry Lead",
      message: "We need to automate this urgently.",
    });

    const first = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });
    expect(first.requiresApproval).toBe(true);

    const { data: secondExecution } = await serviceRole
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

    const second = await runLeadAnalysisPipeline({
      leadId: lead.id,
      executionId: secondExecution!.id,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    expect(second.success).toBe(true);
    expect(second.requiresApproval).toBe(true);

    const { data: secondExecutionRow } = await serviceRole
      .from("workflow_executions")
      .select("status")
      .eq("id", secondExecution!.id)
      .single();
    expect(secondExecutionRow?.status).toBe("waiting_approval");
  });

  it("does not let organization A see organization B's AI-generated lead scores", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");
    const serviceRole = requireServiceRoleClient();

    const { lead: globexLead, executionId } = await createLeadAndExecution(globex, serviceRole, {
      name: "Globex Only Lead",
      message: "hello",
      // Matches supabase/seed.sql's existing Globex marker so this doesn't
      // break tenant-isolation.test.ts's assertion that every Globex lead
      // has this company.
      company: "Wardenclyffe Co",
    });
    await runLeadAnalysisPipeline({
      leadId: globexLead.id,
      executionId,
      supabase: serviceRole,
      provider: new DeterministicTestProvider(),
    });

    const { data: acmeVisibleScores, error } = await acme
      .from("lead_scores")
      .select("*")
      .eq("lead_id", globexLead.id);

    expect(error).toBeNull();
    expect(acmeVisibleScores).toEqual([]);
  });

  it("does not let an authenticated user write lead_scores directly (service-role only)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { data: lead } = await acme
      .from("leads")
      .insert({ name: "Direct Write Attempt" })
      .select()
      .single();

    const { error } = await acme.from("lead_scores").insert({
      lead_id: lead!.id,
      score: 99,
      priority: "high",
      intent: "fake",
      confidence: 1,
      recommended_action: "schedule_call",
      reasoning_summary: "Forged by a client.",
      model: "not-real",
      prompt_version: "not-real",
    });

    expect(error).not.toBeNull();
  });

  it("does not let an authenticated user write workflow_executions directly (service-role only)", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { error } = await acme.from("workflow_executions").insert({
      workflow_name: "lead_intelligence",
      status: "succeeded",
    });

    expect(error).not.toBeNull();
  });
});
