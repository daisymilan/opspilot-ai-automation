import type { DocumentAnalysisInput, DocumentExtraction } from "@/services/documents/schema";
import type { AIProvider } from "./types";

export interface AnalyzeDocumentResult {
  extraction: DocumentExtraction;
  model: string;
  promptVersion: string;
}

/**
 * The AI service contract for documents, mirroring analyzeLead.ts: given
 * any AIProvider (real Claude in production, DeterministicTestProvider in
 * tests) and a normalized document, returns a validated extraction plus
 * the model/prompt_version that produced it.
 */
export async function analyzeDocument(
  provider: AIProvider,
  input: DocumentAnalysisInput,
): Promise<AnalyzeDocumentResult> {
  const extraction = await provider.analyzeDocument(input);
  return { extraction, model: provider.model, promptVersion: provider.documentExtractionPromptVersion };
}
