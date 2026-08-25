import "server-only";

/** N8N_BASE_URL or N8N_WEBHOOK_SECRET is not configured. */
export class N8nConfigurationError extends Error {}

/** The webhook call itself failed — n8n unreachable, timed out, or returned a non-2xx response. */
export class N8nWebhookError extends Error {}

export interface DocumentIntelligenceWebhookPayload {
  documentId: string;
  executionId: string;
  organizationId: string;
}

export interface DocumentIntelligenceWebhookResult {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Real HTTP call to the local/configured n8n instance — never a stub.
 * Mirrors services/n8n/triggerWorkflow.ts exactly, reusing the same
 * N8N_BASE_URL and N8N_WEBHOOK_SECRET (same n8n instance, same Header Auth
 * credential — no reason to provision a second secret for a second
 * workflow on the same trusted host). See docs/document-intelligence.md.
 */
export async function triggerDocumentIntelligenceWorkflow(
  payload: DocumentIntelligenceWebhookPayload,
): Promise<DocumentIntelligenceWebhookResult> {
  const baseUrl = process.env.N8N_BASE_URL;
  const webhookPath = process.env.N8N_DOCUMENT_WEBHOOK_PATH || "/webhook/document-intelligence";
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (!baseUrl || !secret) {
    throw new N8nConfigurationError(
      "N8N_BASE_URL and N8N_WEBHOOK_SECRET must both be set to trigger the document-intelligence " +
        "workflow. See .env.example and docs/document-intelligence.md.",
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

  // Same reasoning as triggerWorkflow.ts: 200 (analysis succeeded) and 422
  // (the pipeline determined this execution failed) are both legitimate,
  // well-formed results — only an unrecognized response means the webhook
  // call itself actually failed.
  if (response.status !== 200 && response.status !== 422) {
    const body = await response.text().catch(() => "");
    throw new N8nWebhookError(
      `n8n webhook responded with ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  let result: DocumentIntelligenceWebhookResult;
  try {
    result = (await response.json()) as DocumentIntelligenceWebhookResult;
  } catch {
    throw new N8nWebhookError("n8n webhook did not return valid JSON.");
  }

  if (typeof result.success !== "boolean") {
    throw new N8nWebhookError("n8n webhook response did not include a recognizable result.");
  }

  return result;
}
