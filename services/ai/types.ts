import type { LeadAnalysis, LeadAnalysisInput } from "./schema";
import type { DocumentAnalysisInput, DocumentExtraction } from "@/services/documents/schema";

/**
 * The application depends on this interface, not on any specific AI
 * vendor's SDK — so swapping/adding a provider (e.g. an OpenAI fallback
 * later) means writing one new class, not touching calling code. One
 * provider serves both verticals (lead analysis, document extraction);
 * prompt versions are per-capability since each has its own prompt/tool
 * schema and evolves independently, but `model` is shared — it's the same
 * underlying Claude model either way.
 */
export interface AIProvider {
  readonly model: string;
  readonly leadAnalysisPromptVersion: string;
  readonly documentExtractionPromptVersion: string;
  analyzeLead(input: LeadAnalysisInput): Promise<LeadAnalysis>;
  analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentExtraction>;
}
