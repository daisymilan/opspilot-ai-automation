import type { DocumentExtraction } from "./schema";

/**
 * AI output is never trusted automatically. Same shape as
 * services/leads/businessRules.ts — pure and synchronous so it's fully
 * unit-testable without any AI call.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Dollar exposure is this vertical's version of "consequential action" —
 * the equivalent of leads' ALWAYS_REQUIRES_APPROVAL_ACTIONS. An invoice
 * above this amount always requires human review, regardless of how
 * confident the model was.
 */
export const DEFAULT_DOCUMENT_APPROVAL_AMOUNT_THRESHOLD = 1000;

export interface DocumentBusinessRuleDecision {
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

export function getDocumentApprovalAmountThreshold(): number {
  const raw = process.env.DOCUMENT_APPROVAL_AMOUNT_THRESHOLD;
  if (!raw) return DEFAULT_DOCUMENT_APPROVAL_AMOUNT_THRESHOLD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_DOCUMENT_APPROVAL_AMOUNT_THRESHOLD;
}

export function decideDocumentAction(
  extraction: DocumentExtraction,
  confidenceThreshold: number = getConfidenceThreshold(),
  amountThreshold: number = getDocumentApprovalAmountThreshold(),
): DocumentBusinessRuleDecision {
  const reasons: string[] = [];

  if (extraction.confidence < confidenceThreshold) {
    reasons.push(
      `confidence ${extraction.confidence} is below the ${confidenceThreshold} threshold`,
    );
  }
  if (extraction.amount !== null && extraction.amount > amountThreshold) {
    reasons.push(`amount ${extraction.amount} exceeds the ${amountThreshold} approval threshold`);
  }

  const requiresApproval = reasons.length > 0;

  return {
    requiresApproval,
    reason: requiresApproval
      ? reasons.join("; ")
      : "confidence meets threshold and the amount is within limits",
  };
}
