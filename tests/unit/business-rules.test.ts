import { describe, expect, it } from "vitest";
import { decideAction } from "@/services/leads/businessRules";
import type { LeadAnalysis } from "@/services/ai/schema";

function analysis(overrides: Partial<LeadAnalysis> = {}): LeadAnalysis {
  return {
    intent: "general_inquiry",
    industry: null,
    priority: "medium",
    score: 60,
    confidence: 0.85,
    recommended_action: "send_follow_up",
    reasoning_summary: "test",
    ...overrides,
  };
}

describe("decideAction", () => {
  it("does not require approval for high confidence + low-risk action", () => {
    const decision = decideAction(
      analysis({ confidence: 0.9, recommended_action: "send_follow_up" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(false);
  });

  it("does not require approval for manual_review even at low confidence-adjacent action", () => {
    const decision = decideAction(
      analysis({ confidence: 0.95, recommended_action: "manual_review" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(false);
  });

  it("requires approval when confidence is below the threshold", () => {
    const decision = decideAction(
      analysis({ confidence: 0.5, recommended_action: "send_follow_up" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toMatch(/confidence/i);
  });

  it("requires approval for schedule_call regardless of confidence", () => {
    const decision = decideAction(
      analysis({ confidence: 0.99, recommended_action: "schedule_call" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(true);
    expect(decision.reason).toMatch(/schedule_call/);
  });

  it("requires approval for assign_sales_owner regardless of confidence", () => {
    const decision = decideAction(
      analysis({ confidence: 0.99, recommended_action: "assign_sales_owner" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(true);
  });

  it("treats confidence exactly at the threshold as sufficient", () => {
    const decision = decideAction(
      analysis({ confidence: 0.7, recommended_action: "send_follow_up" }),
      0.7,
    );
    expect(decision.requiresApproval).toBe(false);
  });

  it("preserves the AI's recommended_action regardless of approval requirement", () => {
    const decision = decideAction(
      analysis({ confidence: 0.2, recommended_action: "manual_review" }),
      0.7,
    );
    expect(decision.recommendedAction).toBe("manual_review");
  });
});
