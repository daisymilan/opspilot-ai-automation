import { describe, expect, it } from "vitest";
import { decideDocumentAction } from "@/services/documents/businessRules";
import type { DocumentExtraction } from "@/services/documents/schema";

function extraction(overrides: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    vendor_name: "Acme Supplies Inc",
    invoice_number: "INV-0001",
    amount: 250,
    currency: "USD",
    due_date: "2026-09-15",
    line_items: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("decideDocumentAction", () => {
  it("does not require approval for high confidence + low amount", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.9, amount: 250 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(false);
  });

  it("requires approval when confidence is below the threshold", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.5, amount: 250 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toMatch(/confidence/i);
  });

  it("requires approval when amount exceeds the threshold, regardless of confidence", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.99, amount: 5000 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toMatch(/amount/i);
  });

  it("requires approval and reports both reasons when confidence is low AND amount is high", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.4, amount: 5000 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toMatch(/confidence/i);
    expect(decision.reason).toMatch(/amount/i);
  });

  it("treats confidence exactly at the threshold as sufficient", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.7, amount: 250 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(false);
  });

  it("treats amount exactly at the threshold as within limits", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.9, amount: 1000 }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(false);
  });

  it("does not require approval on amount when amount is null (nothing to compare)", () => {
    const decision = decideDocumentAction(extraction({ confidence: 0.9, amount: null }), 0.7, 1000);
    expect(decision.requiresApproval).toBe(false);
  });
});
