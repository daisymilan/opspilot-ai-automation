// Shared Badge tone mappings for DB enum values, used across the
// dashboard, approvals, and executions pages so status colors stay
// consistent everywhere they appear.

export const EXECUTION_STATUS_TONE = {
  pending: "neutral",
  running: "neutral",
  succeeded: "success",
  waiting_approval: "warning",
  failed: "danger",
  retrying: "warning",
} as const;

export const APPROVAL_STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
} as const;

export const SERVICE_HEALTH_TONE = {
  healthy: "success",
  unreachable: "danger",
  not_configured: "neutral",
  error: "danger",
} as const;

export const AI_PROVIDER_HEALTH_TONE = {
  not_configured: "neutral",
  configured_unverified: "neutral",
  configured: "success",
  authentication_failure: "danger",
  billing_failure: "danger",
  unavailable: "warning",
  unknown_error: "warning",
} as const;
