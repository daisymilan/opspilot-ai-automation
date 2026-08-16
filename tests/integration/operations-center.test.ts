// Integration tests against a REAL local Supabase/Postgres instance — not
// mocked. Covers Phase 3 (Operations & Human Approval Center): the
// approvals RLS policy (approvals_update_reviewer), the DB-level
// rejection-reason constraint, execution state transitions on
// approve/reject, audit trail creation, and executions tenant isolation.
//
// The approve/reject/retry Server Actions in services/approvals/actions.ts
// and services/executions/actions.ts read cookies via next/headers, which
// only exists inside a real Next.js request — so, following the same
// approach lead-intelligence.test.ts uses for the pipeline, these tests
// exercise the exact same real database operations those actions perform
// (the RLS-respecting approvals UPDATE, the service-role
// workflow_executions/audit_logs writes, the same pure decision
// functions) directly against local Postgres, rather than mocking
// anything.
import { beforeAll, describe, expect, it } from "vitest";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { nextExecutionStatusForApprovalDecision } from "@/services/approvals/statusTransitions";
import { canRetryExecution } from "@/services/executions/retryRules";
import { requireLocalSupabase, requireServiceRoleClient, signInAs } from "./helpers";

beforeAll(() => {
  requireLocalSupabase();
});

async function seedLeadWithApproval(
  ownerClient: Awaited<ReturnType<typeof signInAs>>,
  serviceRole: ReturnType<typeof requireServiceRoleClient>,
  overrides: { name: string; company?: string },
) {
  const { data: lead, error: leadError } = await ownerClient
    .from("leads")
    .insert({ name: overrides.name, company: overrides.company ?? null })
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
      status: "waiting_approval",
    })
    .select("id")
    .single();
  if (executionError || !execution)
    throw new Error(`Failed to create execution: ${executionError?.message}`);

  const { error: scoreError } = await serviceRole.from("lead_scores").insert({
    lead_id: lead.id,
    organization_id: lead.organization_id,
    score: 90,
    priority: "high",
    intent: "buy",
    confidence: 0.9,
    recommended_action: "schedule_call",
    reasoning_summary: "Integration test fixture.",
    model: "test",
    prompt_version: "test",
  });
  if (scoreError) throw new Error(`Failed to create score: ${scoreError.message}`);

  const { data: approval, error: approvalError } = await serviceRole
    .from("approvals")
    .insert({
      organization_id: lead.organization_id,
      entity_type: "lead",
      entity_id: lead.id,
      action_type: "schedule_call",
    })
    .select()
    .single();
  if (approvalError || !approval)
    throw new Error(`Failed to create approval: ${approvalError?.message}`);

  return { lead, executionId: execution.id, approval };
}

describe("approvals: tenant isolation", () => {
  it("does not let organization B see organization A's pending approval", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Isolation Select Lead",
    });

    const globexOwner = await signInAs("owner@globex.dev");
    const { data: leaked, error } = await globexOwner
      .from("approvals")
      .select("*")
      .eq("id", approval.id);

    expect(error).toBeNull();
    expect(leaked).toEqual([]);
  });

  it("does not let organization B update organization A's approval, even as an owner", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Isolation Update Lead",
    });

    const globexOwner = await signInAs("owner@globex.dev");
    const { data: updated, error } = await globexOwner
      .from("approvals")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select();

    // Blocked by approvals_update_reviewer's organization_id check —
    // zero rows match, not a thrown error.
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    const { data: stillPending } = await serviceRole
      .from("approvals")
      .select("status")
      .eq("id", approval.id)
      .single();
    expect(stillPending?.status).toBe("pending");
  });
});

describe("approvals: reviewer authorization", () => {
  it("lets an owner approve a pending approval", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Owner Approve Lead",
    });
    const userId = (await acmeOwner.auth.getUser()).data.user!.id;

    const { data: updated, error } = await acmeOwner
      .from("approvals")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select()
      .single();

    expect(error).toBeNull();
    expect(updated?.status).toBe("approved");
  });

  it("does not let a member (non-owner/non-admin) approve — RLS blocks it at the database, not just a hidden UI button", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Member Approve Attempt Lead",
    });

    const acmeMember = await signInAs("member@acme-ops.dev");
    const { data: updated, error } = await acmeMember
      .from("approvals")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select();

    // approvals_update_reviewer's `role in ('owner','admin')` check fails
    // for a member — this is the same real database-level enforcement
    // services/approvals/actions.ts's explicit role check backs up.
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    const { data: stillPending } = await serviceRole
      .from("approvals")
      .select("status")
      .eq("id", approval.id)
      .single();
    expect(stillPending?.status).toBe("pending");
  });
});

describe("approvals: rejection requires a reason", () => {
  it("is rejected by the database itself when rejection_reason is missing (defense in depth beyond the Zod schema)", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Reject Without Reason Lead",
    });

    const { error } = await acmeOwner
      .from("approvals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending");

    // The table's own check constraint:
    // status <> 'rejected' or rejection_reason is not null.
    expect(error).not.toBeNull();
  });

  it("succeeds when a rejection reason is provided", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Reject With Reason Lead",
    });

    const { data: updated, error } = await acmeOwner
      .from("approvals")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Budget too low for this quarter.",
      })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select()
      .single();

    expect(error).toBeNull();
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejection_reason).toBe("Budget too low for this quarter.");
  });
});

describe("approvals: execution state transitions and audit trail", () => {
  it("moves a waiting_approval execution to succeeded when approved, and records approval.approved", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { lead, executionId, approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Approve Transition Lead",
    });
    const userId = (await acmeOwner.auth.getUser()).data.user!.id;

    await acmeOwner
      .from("approvals")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending");

    // Mirrors services/approvals/actions.ts's service-role write, using
    // the exact same pure decision function it calls.
    await serviceRole
      .from("workflow_executions")
      .update({
        status: nextExecutionStatusForApprovalDecision("approved"),
        completed_at: new Date().toISOString(),
      })
      .eq("id", executionId);

    await recordAuditEvent(serviceRole, {
      organizationId: lead.organization_id,
      actorId: userId,
      action: "approval.approved",
      entityType: "lead",
      entityId: lead.id,
      metadata: { approvalId: approval.id },
    });

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .select("status")
      .eq("id", executionId)
      .single();
    expect(execution?.status).toBe("succeeded");

    const { data: auditRows } = await serviceRole
      .from("audit_logs")
      .select("action")
      .eq("entity_id", lead.id);
    expect(auditRows?.map((row) => row.action)).toContain("approval.approved");
  });

  it("moves a waiting_approval execution to failed when rejected, and records approval.rejected", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { lead, executionId, approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Reject Transition Lead",
    });
    const userId = (await acmeOwner.auth.getUser()).data.user!.id;

    await acmeOwner
      .from("approvals")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Not a fit.",
      })
      .eq("id", approval.id)
      .eq("status", "pending");

    await serviceRole
      .from("workflow_executions")
      .update({
        status: nextExecutionStatusForApprovalDecision("rejected"),
        completed_at: new Date().toISOString(),
        error_message: "Rejected by reviewer: Not a fit.",
      })
      .eq("id", executionId);

    await recordAuditEvent(serviceRole, {
      organizationId: lead.organization_id,
      actorId: userId,
      action: "approval.rejected",
      entityType: "lead",
      entityId: lead.id,
      metadata: { approvalId: approval.id, rejectionReason: "Not a fit." },
    });

    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .select("status, error_message")
      .eq("id", executionId)
      .single();
    expect(execution?.status).toBe("failed");
    expect(execution?.error_message).toContain("Not a fit.");

    const { data: auditRows } = await serviceRole
      .from("audit_logs")
      .select("action")
      .eq("entity_id", lead.id);
    expect(auditRows?.map((row) => row.action)).toContain("approval.rejected");
  });

  it("cannot double-decide the same approval (race guard: the second UPDATE matches zero rows)", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { approval } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Double Decide Lead",
    });
    const userId = (await acmeOwner.auth.getUser()).data.user!.id;

    const first = await acmeOwner
      .from("approvals")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select();
    expect(first.data).toHaveLength(1);

    const second = await acmeOwner
      .from("approvals")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: "too late",
      })
      .eq("id", approval.id)
      .eq("status", "pending")
      .select();

    // The .eq("status", "pending") guard closes the race: the
    // already-approved row no longer matches — exactly the guard
    // services/approvals/actions.ts relies on.
    expect(second.data).toEqual([]);

    const { data: finalState } = await serviceRole
      .from("approvals")
      .select("status")
      .eq("id", approval.id)
      .single();
    expect(finalState?.status).toBe("approved");
  });
});

describe("executions: tenant isolation and read access", () => {
  it("does not let organization B read organization A's execution by id", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { executionId } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Execution Isolation Lead",
    });

    const globexOwner = await signInAs("owner@globex.dev");
    const { data: leaked, error } = await globexOwner
      .from("workflow_executions")
      .select("*")
      .eq("id", executionId);

    expect(error).toBeNull();
    expect(leaked).toEqual([]);
  });

  it("lets another member of the same organization read the execution", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { executionId } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Execution Own Org Read Lead",
    });

    const acmeMember = await signInAs("member@acme-ops.dev");
    const { data: execution, error } = await acmeMember
      .from("workflow_executions")
      .select("*")
      .eq("id", executionId)
      .single();

    expect(error).toBeNull();
    expect(execution?.id).toBe(executionId);
  });
});

describe("executions: retry rules against real data", () => {
  it("does not expose another organization's failed execution to retry (not found under RLS)", async () => {
    const globexOwner = await signInAs("owner@globex.dev");
    const serviceRole = requireServiceRoleClient();
    const { data: lead } = await globexOwner
      .from("leads")
      .insert({ name: "Globex Retry Lead", company: "Wardenclyffe Co" })
      .select()
      .single();
    const { data: execution } = await serviceRole
      .from("workflow_executions")
      .insert({
        organization_id: lead!.organization_id,
        workflow_name: "lead_intelligence",
        entity_type: "lead",
        entity_id: lead!.id,
        status: "failed",
        error_message: "boom",
      })
      .select("id")
      .single();

    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const { data: crossOrgRead, error } = await acmeOwner
      .from("workflow_executions")
      .select("id, status")
      .eq("id", execution!.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(crossOrgRead).toBeNull();
  });

  it("canRetryExecution reflects the execution's real current status, not an assumption", async () => {
    const acmeOwner = await signInAs("owner@acme-ops.dev");
    const serviceRole = requireServiceRoleClient();
    const { executionId } = await seedLeadWithApproval(acmeOwner, serviceRole, {
      name: "Retry Rule Check Lead",
    });

    const { data: waitingExecution } = await acmeOwner
      .from("workflow_executions")
      .select("status")
      .eq("id", executionId)
      .single();
    expect(canRetryExecution(waitingExecution!)).toBe(false);

    await serviceRole
      .from("workflow_executions")
      .update({
        status: "failed",
        error_message: "AI call failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", executionId);

    const { data: failedExecution } = await acmeOwner
      .from("workflow_executions")
      .select("status")
      .eq("id", executionId)
      .single();
    expect(canRetryExecution(failedExecution!)).toBe(true);
  });
});
