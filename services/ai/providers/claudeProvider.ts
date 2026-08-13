import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { leadAnalysisSchema, type LeadAnalysis, type LeadAnalysisInput } from "../schema";
import { LEAD_ANALYSIS_PROMPT_VERSION, buildLeadAnalysisRequest } from "../prompts/leadAnalysis";
import type { AIProvider } from "../types";

/** ANTHROPIC_API_KEY missing or otherwise misconfigured — never caught and papered over with fake data. */
export class AIConfigurationError extends Error {}

/** The Claude API call itself failed (network, rate limit, timeout, 5xx, etc). */
export class AIProviderError extends Error {}

/** Claude responded, but not with valid structured output. */
export class AIOutputValidationError extends Error {}

const DEFAULT_MODEL = "claude-sonnet-5";

/** Real Claude integration. Throws loudly rather than returning placeholder data when misconfigured or failing. */
export class ClaudeProvider implements AIProvider {
  readonly model: string;
  readonly promptVersion = LEAD_ANALYSIS_PROMPT_VERSION;
  private readonly client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AIConfigurationError(
        "ANTHROPIC_API_KEY is not set. The lead-analysis pipeline requires a real Claude API key " +
          "(see .env.example) — no fallback or demo data is generated when it's missing.",
      );
    }
    this.model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
    // Explicit timeout so a hung request fails the execution record
    // instead of hanging the webhook indefinitely.
    this.client = new Anthropic({ apiKey, timeout: 30_000 });
  }

  async analyzeLead(input: LeadAnalysisInput): Promise<LeadAnalysis> {
    const { system, userMessage, tool, toolName } = buildLeadAnalysisRequest(input);

    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userMessage }],
        tools: [tool],
        tool_choice: { type: "tool", name: toolName },
      });
    } catch (err) {
      throw new AIProviderError(
        `Claude API call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === toolName,
    );
    if (!toolUse) {
      throw new AIOutputValidationError("Claude did not return the expected structured tool call.");
    }

    const parsed = leadAnalysisSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new AIOutputValidationError(
        `AI output failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }

    return parsed.data;
  }
}
