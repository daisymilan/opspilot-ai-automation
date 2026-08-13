import "server-only";

/** N8N_BASE_URL or N8N_WEBHOOK_SECRET is not configured. */
export class N8nConfigurationError extends Error {}

/** The webhook call itself failed — n8n unreachable, timed out, or returned a non-2xx response. */
export class N8nWebhookError extends Error {}

export interface LeadIntelligenceWebhookPayload {
  leadId: string;
  executionId: string;
  organizationId: string;
}

export interface LeadIntelligenceWebhookResult {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Real HTTP call to the local/configured n8n instance — never a stub.
 * Header-secret authenticated in both directions: n8n's webhook node is
 * configured with matching Header Auth, and app/api/leads/[id]/analyze
 * (which n8n calls back into) checks the same secret. See
 * docs/lead-intelligence.md for the full trust boundary.
 */
export async function triggerLeadIntelligenceWorkflow(
  payload: LeadIntelligenceWebhookPayload,
): Promise<LeadIntelligenceWebhookResult> {
  const baseUrl = process.env.N8N_BASE_URL;
  const webhookPath = process.env.N8N_LEAD_WEBHOOK_PATH || "/webhook/lead-intelligence";
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (!baseUrl || !secret) {
    throw new N8nConfigurationError(
      "N8N_BASE_URL and N8N_WEBHOOK_SECRET must both be set to trigger the lead-intelligence " +
        "workflow. See .env.example and docs/lead-intelligence.md.",
    );
  }

  const url = new URL(webhookPath, baseUrl).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new N8nWebhookError(
      `Could not reach n8n at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // The workflow forwards app/api/leads/[id]/analyze's own response
  // verbatim, including its status: 200 (analysis succeeded) or 422 (the
  // pipeline determined this execution failed — e.g. missing API key,
  // invalid AI output). Both are legitimate, well-formed results, not a
  // failure of n8n itself — only an unrecognized response means the
  // webhook call itself actually failed. Conflating the two would let a
  // generic "n8n webhook failed" message overwrite the pipeline's own
  // precise error on the execution record.
  if (response.status !== 200 && response.status !== 422) {
    const body = await response.text().catch(() => "");
    throw new N8nWebhookError(
      `n8n webhook responded with ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  let result: LeadIntelligenceWebhookResult;
  try {
    result = (await response.json()) as LeadIntelligenceWebhookResult;
  } catch {
    throw new N8nWebhookError("n8n webhook did not return valid JSON.");
  }

  if (typeof result.success !== "boolean") {
    throw new N8nWebhookError("n8n webhook response did not include a recognizable result.");
  }

  return result;
}
