import { describe, expect, it } from "vitest";
import { analyzeLead } from "@/services/ai/analyzeLead";
import { analyzeDocument } from "@/services/ai/analyzeDocument";
import { leadAnalysisSchema } from "@/services/ai/schema";
import { documentExtractionSchema } from "@/services/documents/schema";
import { DeterministicTestProvider } from "@/services/ai/providers/deterministicTestProvider";

// Exercises the AIProvider contract end to end (analyzeLead orchestration +
// schema validation) using the deterministic test provider — never the
// real Claude provider, so this runs with no network call and no API key.
describe("AI service contract (deterministic provider)", () => {
  it("returns output that satisfies leadAnalysisSchema for a high-intent lead", async () => {
    const provider = new DeterministicTestProvider();
    const result = await analyzeLead(provider, {
      name: "John Smith",
      company: "ABC Realty",
      email: "john@abcrealty.com",
      source: "website",
      message: "We are looking to automate our lead follow-up process urgently.",
    });

    expect(leadAnalysisSchema.safeParse(result.analysis).success).toBe(true);
    expect(result.analysis.priority).toBe("high");
    expect(result.model).toBe("deterministic-test-provider");
    expect(result.promptVersion).toBe("test-fixture");
  });

  it("returns output that satisfies leadAnalysisSchema for a low-intent lead", async () => {
    const provider = new DeterministicTestProvider();
    const result = await analyzeLead(provider, {
      name: "Jane Doe",
      company: null,
      email: null,
      source: "manual",
      message: "Just browsing, thanks.",
    });

    expect(leadAnalysisSchema.safeParse(result.analysis).success).toBe(true);
    expect(result.analysis.priority).toBe("medium");
  });

  it("never labels the deterministic provider's model as a real Claude model", async () => {
    const provider = new DeterministicTestProvider();
    expect(provider.model).not.toMatch(/claude/i);
    expect(provider.model).toContain("test");
  });
});

// Same AIProvider contract, exercised for the document-extraction
// capability (Phase 5) — one interface, two verticals.
describe("AI service contract, document extraction (deterministic provider)", () => {
  it("returns output that satisfies documentExtractionSchema for a high-amount document", async () => {
    const provider = new DeterministicTestProvider();
    const result = await analyzeDocument(provider, {
      data: Buffer.from("high_amount invoice content").toString("base64"),
      mimeType: "application/pdf",
    });

    expect(documentExtractionSchema.safeParse(result.extraction).success).toBe(true);
    expect(result.extraction.amount).toBe(5000);
    expect(result.model).toBe("deterministic-test-provider");
    expect(result.promptVersion).toBe("test-fixture");
  });

  it("returns output that satisfies documentExtractionSchema for a low-confidence document", async () => {
    const provider = new DeterministicTestProvider();
    const result = await analyzeDocument(provider, {
      data: Buffer.from("low_confidence blurry scan").toString("base64"),
      mimeType: "image/jpeg",
    });

    expect(documentExtractionSchema.safeParse(result.extraction).success).toBe(true);
    expect(result.extraction.confidence).toBeLessThan(0.7);
  });
});
