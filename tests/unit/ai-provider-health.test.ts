import { describe, expect, it } from "vitest";
import { deriveAiProviderHealth } from "@/services/dashboard/aiProviderHealth";

describe("deriveAiProviderHealth", () => {
  it("reports not_configured when no API key is present, regardless of history", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: false,
      mostRecentExecution: { status: "succeeded", error_message: null },
    });
    expect(result.state).toBe("not_configured");
    expect(result.basedOn).toBe("not_configured");
  });

  it("reports configured_unverified when configured but no execution has run yet", () => {
    const result = deriveAiProviderHealth({ apiKeyConfigured: true, mostRecentExecution: null });
    expect(result.state).toBe("configured_unverified");
    expect(result.basedOn).toBe("no_recent_execution");
  });

  it("reports configured when the most recent execution succeeded", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: { status: "succeeded", error_message: null },
    });
    expect(result.state).toBe("configured");
  });

  it("reports configured when the most recent execution is waiting_approval", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: { status: "waiting_approval", error_message: null },
    });
    expect(result.state).toBe("configured");
  });

  it("classifies a real captured billing-failure message correctly", () => {
    // The exact error this project's own live Claude verification produced.
    const realError =
      'Claude API call failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CdzpEyPXHpemoPTR1N4Am"}';
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: { status: "failed", error_message: realError },
    });
    expect(result.state).toBe("billing_failure");
    expect(result.detail).toBe(realError);
    expect(result.basedOn).toBe("most_recent_execution");
  });

  it("classifies a missing-key error as not_configured even if apiKeyConfigured is stale/true", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: {
        status: "failed",
        error_message: "ANTHROPIC_API_KEY is not set. The lead-analysis pipeline requires...",
      },
    });
    expect(result.state).toBe("not_configured");
  });

  it("classifies an authentication error correctly", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: {
        status: "failed",
        error_message: 'Claude API call failed: 401 {"error":{"type":"authentication_error"}}',
      },
    });
    expect(result.state).toBe("authentication_failure");
  });

  it("classifies a network/unreachable error correctly", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: {
        status: "failed",
        error_message: "Claude API call failed: request timeout",
      },
    });
    expect(result.state).toBe("unavailable");
  });

  it("does not blame the AI provider for an unrelated failure (e.g. a database error)", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: {
        status: "failed",
        error_message: "Failed to persist lead analysis: connection refused",
      },
    });
    expect(result.state).toBe("configured_unverified");
  });

  it("falls back to unknown_error for an AI-related failure it can't classify further", () => {
    const result = deriveAiProviderHealth({
      apiKeyConfigured: true,
      mostRecentExecution: {
        status: "failed",
        error_message: "Claude API call failed: 500 something unexpected",
      },
    });
    expect(result.state).toBe("unknown_error");
  });
});
