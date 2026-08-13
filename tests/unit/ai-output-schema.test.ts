import { describe, expect, it } from "vitest";
import { leadAnalysisSchema } from "@/services/ai/schema";

const validAnalysis = {
  intent: "automation_services",
  industry: "real_estate",
  priority: "high",
  score: 87,
  confidence: 0.94,
  recommended_action: "schedule_call",
  reasoning_summary: "Clear buying intent and urgency in the message.",
};

describe("leadAnalysisSchema", () => {
  it("accepts a fully valid analysis", () => {
    expect(leadAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("accepts a null industry", () => {
    const result = leadAnalysisSchema.safeParse({ ...validAnalysis, industry: null });
    expect(result.success).toBe(true);
  });

  it.each([-1, 101, 50.5])("rejects an out-of-bounds or non-integer score (%s)", (score) => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, score }).success).toBe(false);
  });

  it.each([0, 100])("accepts score at the boundary (%s)", (score) => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, score }).success).toBe(true);
  });

  it.each([-0.01, 1.01])("rejects an out-of-bounds confidence (%s)", (confidence) => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, confidence }).success).toBe(false);
  });

  it.each([0, 1])("accepts confidence at the boundary (%s)", (confidence) => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, confidence }).success).toBe(true);
  });

  it("rejects an arbitrary priority string", () => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, priority: "urgent" }).success).toBe(
      false,
    );
  });

  it("rejects an arbitrary recommended_action string", () => {
    const result = leadAnalysisSchema.safeParse({
      ...validAnalysis,
      recommended_action: "call_now",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reasoning_summary", () => {
    expect(leadAnalysisSchema.safeParse({ ...validAnalysis, reasoning_summary: "" }).success).toBe(
      false,
    );
  });

  it("rejects a missing required field", () => {
    const withoutScore: Record<string, unknown> = { ...validAnalysis };
    delete withoutScore.score;
    expect(leadAnalysisSchema.safeParse(withoutScore).success).toBe(false);
  });
});
