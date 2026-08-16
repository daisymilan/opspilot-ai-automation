// Pure classification logic — no DB, no network. Deliberately does NOT
// ping Claude live on every dashboard load (that costs real money);
// instead it's honestly derived from (a) whether a key is configured at
// all and (b) the most recent lead-intelligence execution's real outcome.
// Every state is labeled with how it was derived so the UI never implies
// a live health check that didn't happen.

export type AiProviderHealthState =
  | "not_configured"
  | "configured_unverified"
  | "configured"
  | "authentication_failure"
  | "billing_failure"
  | "unavailable"
  | "unknown_error";

export interface AiProviderHealth {
  state: AiProviderHealthState;
  label: string;
  detail?: string;
  /** How this was determined — always shown in the UI, never left implicit. */
  basedOn: "not_configured" | "no_recent_execution" | "most_recent_execution";
}

const LABELS: Record<AiProviderHealthState, string> = {
  not_configured: "Not configured",
  configured_unverified: "Configured (unverified)",
  configured: "Configured",
  authentication_failure: "Authentication failure",
  billing_failure: "Billing failure",
  unavailable: "Unavailable",
  unknown_error: "Unknown error",
};

function classifyClaudeErrorMessage(message: string): AiProviderHealthState {
  const lower = message.toLowerCase();
  if (lower.includes("anthropic_api_key is not set")) return "not_configured";
  if (lower.includes("credit balance") || lower.includes("billing")) return "billing_failure";
  if (
    lower.includes("authentication") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("invalid_api_key") ||
    lower.includes(" 401")
  ) {
    return "authentication_failure";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("could not reach") ||
    lower.includes("fetch failed")
  ) {
    return "unavailable";
  }
  return "unknown_error";
}

/** Only classify a failed execution as an AI-provider problem if its error actually looks AI-related. */
function looksAiRelated(message: string): boolean {
  return /claude|anthropic|ai (analysis|output)/i.test(message);
}

export interface RecentLeadIntelligenceExecution {
  status: string;
  error_message: string | null;
}

export function deriveAiProviderHealth(params: {
  apiKeyConfigured: boolean;
  mostRecentExecution: RecentLeadIntelligenceExecution | null;
}): AiProviderHealth {
  if (!params.apiKeyConfigured) {
    return {
      state: "not_configured",
      label: LABELS.not_configured,
      detail: "ANTHROPIC_API_KEY is not set.",
      basedOn: "not_configured",
    };
  }

  const execution = params.mostRecentExecution;
  if (!execution) {
    return {
      state: "configured_unverified",
      label: LABELS.configured_unverified,
      basedOn: "no_recent_execution",
    };
  }

  if (execution.status === "succeeded" || execution.status === "waiting_approval") {
    return { state: "configured", label: LABELS.configured, basedOn: "most_recent_execution" };
  }

  if (execution.status === "failed" && execution.error_message) {
    if (!looksAiRelated(execution.error_message)) {
      return {
        state: "configured_unverified",
        label: LABELS.configured_unverified,
        basedOn: "no_recent_execution",
      };
    }
    const state = classifyClaudeErrorMessage(execution.error_message);
    return {
      state,
      label: LABELS[state],
      detail: execution.error_message,
      basedOn: "most_recent_execution",
    };
  }

  return {
    state: "configured_unverified",
    label: LABELS.configured_unverified,
    basedOn: "no_recent_execution",
  };
}
