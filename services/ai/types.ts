import type { LeadAnalysis, LeadAnalysisInput } from "./schema";

/**
 * The application depends on this interface, not on any specific AI
 * vendor's SDK — so swapping/adding a provider (e.g. an OpenAI fallback
 * later) means writing one new class, not touching calling code.
 */
export interface AIProvider {
  readonly model: string;
  readonly promptVersion: string;
  analyzeLead(input: LeadAnalysisInput): Promise<LeadAnalysis>;
}
