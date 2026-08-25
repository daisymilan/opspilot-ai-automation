import { describe, expect, it } from "vitest";
import { documentExtractionSchema } from "@/services/documents/schema";

const validExtraction = {
  vendor_name: "Acme Supplies Inc",
  invoice_number: "INV-2026-0042",
  amount: 1234.56,
  currency: "USD",
  due_date: "2026-09-15",
  line_items: [{ description: "Widgets", quantity: 10, amount: 1234.56 }],
  confidence: 0.92,
};

describe("documentExtractionSchema", () => {
  it("accepts a fully valid extraction", () => {
    expect(documentExtractionSchema.safeParse(validExtraction).success).toBe(true);
  });

  it("accepts null for every genuinely optional field", () => {
    const result = documentExtractionSchema.safeParse({
      ...validExtraction,
      vendor_name: null,
      invoice_number: null,
      amount: null,
      currency: null,
      due_date: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty line_items array", () => {
    const result = documentExtractionSchema.safeParse({ ...validExtraction, line_items: [] });
    expect(result.success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(documentExtractionSchema.safeParse({ ...validExtraction, amount: -1 }).success).toBe(
      false,
    );
  });

  it("accepts amount of exactly zero", () => {
    expect(documentExtractionSchema.safeParse({ ...validExtraction, amount: 0 }).success).toBe(
      true,
    );
  });

  it.each([-0.01, 1.01])("rejects an out-of-bounds confidence (%s)", (confidence) => {
    expect(
      documentExtractionSchema.safeParse({ ...validExtraction, confidence }).success,
    ).toBe(false);
  });

  it.each([0, 1])("accepts confidence at the boundary (%s)", (confidence) => {
    expect(
      documentExtractionSchema.safeParse({ ...validExtraction, confidence }).success,
    ).toBe(true);
  });

  it("rejects a currency code that isn't 3 characters", () => {
    expect(
      documentExtractionSchema.safeParse({ ...validExtraction, currency: "US" }).success,
    ).toBe(false);
  });

  it("rejects a due_date that isn't a valid ISO date", () => {
    expect(
      documentExtractionSchema.safeParse({ ...validExtraction, due_date: "09/15/2026" }).success,
    ).toBe(false);
  });

  it("rejects more than 50 line items", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      description: `Item ${i}`,
      quantity: 1,
      amount: 1,
    }));
    expect(
      documentExtractionSchema.safeParse({ ...validExtraction, line_items: tooMany }).success,
    ).toBe(false);
  });

  it("rejects a line item with an empty description", () => {
    const result = documentExtractionSchema.safeParse({
      ...validExtraction,
      line_items: [{ description: "", quantity: 1, amount: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const withoutConfidence: Record<string, unknown> = { ...validExtraction };
    delete withoutConfidence.confidence;
    expect(documentExtractionSchema.safeParse(withoutConfidence).success).toBe(false);
  });
});
