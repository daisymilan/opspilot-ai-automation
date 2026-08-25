import type { LeadAnalysis, LeadAnalysisInput } from "../schema";
import type { DocumentAnalysisInput, DocumentExtraction } from "@/services/documents/schema";
import type { AIProvider } from "../types";

/**
 * NOT a real AI provider — deterministic, rule-based output for tests
 * only. Exists so the pipeline's plumbing (validation, business rules,
 * persistence, execution/audit recording) can be exercised without a live
 * Claude API key or network call.
 *
 * Never wire this into a production code path, and never call it "AI" in
 * anything user-facing — the `model` value below is deliberately an
 * obvious, unmistakable label rather than something that could pass for
 * a real model name.
 */
export class DeterministicTestProvider implements AIProvider {
  readonly model = "deterministic-test-provider";
  readonly leadAnalysisPromptVersion = "test-fixture";
  readonly documentExtractionPromptVersion = "test-fixture";

  async analyzeLead(input: LeadAnalysisInput): Promise<LeadAnalysis> {
    const text = `${input.message ?? ""} ${input.company ?? ""}`.toLowerCase();
    const highIntent = text.includes("automat") || text.includes("urgent");

    return {
      intent: highIntent ? "automation_services" : "general_inquiry",
      industry: input.company ? "unspecified" : null,
      priority: highIntent ? "high" : "medium",
      score: highIntent ? 85 : 50,
      // Deliberately above the default 0.7 approval threshold even on the
      // low-intent path, so this fixture can genuinely exercise both the
      // "no approval needed" and "approval required" business-rule
      // outcomes — see tests/integration/lead-intelligence.test.ts.
      confidence: highIntent ? 0.9 : 0.75,
      recommended_action: highIntent ? "schedule_call" : "send_follow_up",
      reasoning_summary: `Deterministic test fixture: keyword match on "automat"/"urgent" = ${highIntent}.`,
    };
  }

  /**
   * There's no real file to OCR here, so the fixture's "file content" is
   * just the base64-decoded text itself — tests encode plain keyword
   * strings (e.g. "high_amount", "low_confidence") instead of real PDF/
   * image bytes, the same keyword-matching convention analyzeLead above
   * uses for message/company text.
   */
  async analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentExtraction> {
    const text = Buffer.from(input.data, "base64").toString("utf8").toLowerCase();
    const highAmount = text.includes("high_amount");
    const lowConfidence = text.includes("low_confidence");
    const amount = highAmount ? 5000 : 250;

    return {
      vendor_name: text.includes("no_vendor") ? null : "Acme Testing Supplies",
      invoice_number: "INV-TEST-0001",
      amount,
      currency: "USD",
      due_date: "2026-09-01",
      line_items: [{ description: "Test line item", quantity: 1, amount }],
      confidence: lowConfidence ? 0.4 : 0.9,
    };
  }
}
