import type { LeadAnalysis, LeadAnalysisInput } from "./schema";
import type { AIProvider } from "./types";

export interface AnalyzeLeadResult {
  analysis: LeadAnalysis;
  model: string;
  promptVersion: string;
}

/**
 * The AI service contract: given any AIProvider (real Claude in
 * production, DeterministicTestProvider in tests) and a normalized lead,
 * returns a validated analysis plus the model/prompt_version that
 * produced it — everything services/leads needs to persist a lead_scores
 * row without knowing which provider ran.
 */
export async function analyzeLead(
  provider: AIProvider,
  input: LeadAnalysisInput,
): Promise<AnalyzeLeadResult> {
  const analysis = await provider.analyzeLead(input);
  return { analysis, model: provider.model, promptVersion: provider.promptVersion };
}
