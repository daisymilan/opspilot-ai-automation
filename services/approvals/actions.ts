"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { recordAuditEvent } from "@/services/audit/recordAuditEvent";
import { approveApprovalSchema, rejectApprovalSchema } from "./schema";
import { nextExecutionStatusForApprovalDecision } from "./statusTransitions";

export interface ApprovalActionState {
  error?: string;
}

/**
 * The execution that a pending approval blocks: the most recent
 * waiting_approval execution for the same entity. Not a foreign key
 * (workflow_executions/approvals both reference leads polymorphically by
 * design — see Phase 1) so it's found by entity, not joined.
 */
async function findWaitingExecutionId(
  supabase: SupabaseClient<Database>,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workflow_executions")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "waiting_approval")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function revalidateApprovalPages(entityId: string) {
  revalidatePath("/approvals");
  revalidatePath("/executions");
  revalidatePath("/dashboard");
  revalidatePath(`/leads/${entityId}`);
}

export async function approveApprovalAction(
  _prevState: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const parsed = approveApprovalSchema.safeParse({ approvalId: formData.get("approvalId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  // RLS-respecting client for everything the caller's own session is
  // allowed to do — including the approvals UPDATE itself, which Phase 1's
  // approvals_update_reviewer policy already restricts to owner/admin.
  // This explicit role check exists only to fail with a clear message
  // before hitting the database; RLS is what actually enforces it (an
  // unauthorized call fails even if this check had a bug).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    return { error: "Only owners and admins can approve requests" };
  }

  const { data: approval } = await supabase
    .from("approvals")
    .select("id, organization_id, entity_type, entity_id, status")
    .eq("id", parsed.data.approvalId)
    .single();
  if (!approval) return { error: "Approval not found" };
  if (approval.status !== "pending") return { error: "This approval has already been decided" };

  // The .eq("status", "pending") guard (not just .eq("id", ...)) closes a
  // race: if two reviewers submit at once, only the first UPDATE matches
  // a row; .single() on zero matches is a real error, not a silent no-op.
  const { data: updated, error: updateError } = await supabase
    .from("approvals")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", approval.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (updateError || !updated) {
    return { error: "Failed to approve — it may have already been decided" };
  }

  // workflow_executions and audit_logs are service-role-write-only by
  // design (Phase 1/2) even for an authorized caller's own action —
  // mirrors the exact pattern services/leads/createLeadAndAnalyze.ts uses.
  const serviceRole = createServiceRoleClient();
  const executionId = await findWaitingExecutionId(
    serviceRole,
    approval.entity_type,
    approval.entity_id,
  );
  if (executionId) {
    await serviceRole
      .from("workflow_executions")
      .update({
        status: nextExecutionStatusForApprovalDecision("approved"),
        completed_at: new Date().toISOString(),
      })
      .eq("id", executionId);
  }

  await recordAuditEvent(serviceRole, {
    organizationId: approval.organization_id,
    actorId: user.id,
    action: "approval.approved",
    entityType: approval.entity_type,
    entityId: approval.entity_id,
    metadata: { approvalId: approval.id },
  });

  revalidateApprovalPages(approval.entity_id);
  return {};
}

export async function rejectApprovalAction(
  _prevState: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const parsed = rejectApprovalSchema.safeParse({
    approvalId: formData.get("approvalId"),
    rejectionReason: formData.get("rejectionReason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "owner" && profile.role !== "admin")) {
    return { error: "Only owners and admins can reject requests" };
  }

  const { data: approval } = await supabase
    .from("approvals")
    .select("id, organization_id, entity_type, entity_id, status")
    .eq("id", parsed.data.approvalId)
    .single();
  if (!approval) return { error: "Approval not found" };
  if (approval.status !== "pending") return { error: "This approval has already been decided" };

  const { data: updated, error: updateError } = await supabase
    .from("approvals")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: parsed.data.rejectionReason,
    })
    .eq("id", approval.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (updateError || !updated) {
    return { error: "Failed to reject — it may have already been decided" };
  }

  const serviceRole = createServiceRoleClient();
  const executionId = await findWaitingExecutionId(
    serviceRole,
    approval.entity_type,
    approval.entity_id,
  );
  if (executionId) {
    await serviceRole
      .from("workflow_executions")
      .update({
        status: nextExecutionStatusForApprovalDecision("rejected"),
        completed_at: new Date().toISOString(),
        error_message: `Rejected by reviewer: ${parsed.data.rejectionReason}`,
      })
      .eq("id", executionId);
  }

  await recordAuditEvent(serviceRole, {
    organizationId: approval.organization_id,
    actorId: user.id,
    action: "approval.rejected",
    entityType: approval.entity_type,
    entityId: approval.entity_id,
    metadata: { approvalId: approval.id, rejectionReason: parsed.data.rejectionReason },
  });

  revalidateApprovalPages(approval.entity_id);
  return {};
}
