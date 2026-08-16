// Pure state-transition rule, deliberately isolated so it's independently
// testable and there is exactly one place that decides this mapping.

export type ApprovalDecision = "approved" | "rejected";
export type ExecutionTerminalStatus = "succeeded" | "failed";

/**
 * waiting_approval -> succeeded when approved (the Phase 3 internal
 * business action completes: there is no external email/CRM mutation
 * yet, so "approved" already fully resolves the execution).
 * waiting_approval -> failed when rejected (the recommended action was
 * declined and will not happen — the approvals row itself, not this
 * status, is the human-readable record of *why*).
 */
export function nextExecutionStatusForApprovalDecision(
  decision: ApprovalDecision,
): ExecutionTerminalStatus {
  return decision === "approved" ? "succeeded" : "failed";
}
