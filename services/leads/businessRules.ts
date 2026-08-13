import type { LeadAnalysis } from "@/services/ai/schema";

/**
 * AI output is never trusted automatically. This is the layer between
 * "what the model said" and "what the system does about it" — pure and
 * synchronous so it's fully unit-testable without any AI call.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * These actions commit sales resources (a call, an assigned owner) rather
 * than something low-risk/reversible like a follow-up email — they
 * require human approval regardless of how confident the model was.
 */
const ALWAYS_REQUIRES_APPROVAL_ACTIONS = new Set<LeadAnalysis["recommended_action"]>([
  "schedule_call",
  "assign_sales_owner",
]);

export interface BusinessRuleDecision {
  recommendedAction: LeadAnalysis["recommended_action"];
  requiresApproval: boolean;
  reason: string;
}

export function getConfidenceThreshold(): number {
  const raw = process.env.AI_CONFIDENCE_THRESHOLD;
  if (!raw) return DEFAULT_CONFIDENCE_THRESHOLD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_CONFIDENCE_THRESHOLD;
}

export function decideAction(
  analysis: LeadAnalysis,
  confidenceThreshold: number = getConfidenceThreshold(),
): BusinessRuleDecision {
  const reasons: string[] = [];

  if (analysis.confidence < confidenceThreshold) {
    reasons.push(`confidence ${analysis.confidence} is below the ${confidenceThreshold} threshold`);
  }
  if (ALWAYS_REQUIRES_APPROVAL_ACTIONS.has(analysis.recommended_action)) {
    reasons.push(`"${analysis.recommended_action}" always requires human approval`);
  }

  const requiresApproval = reasons.length > 0;

  return {
    recommendedAction: analysis.recommended_action,
    requiresApproval,
    reason: requiresApproval
      ? reasons.join("; ")
      : "confidence meets threshold and the action is low-risk",
  };
}
