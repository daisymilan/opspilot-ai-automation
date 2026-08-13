import { z } from "zod";

/** Normalized lead representation sent to the AI. Nothing beyond what's needed to classify the lead. */
export const leadAnalysisInputSchema = z.object({
  name: z.string(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string(),
  message: z.string().nullable(),
});

export type LeadAnalysisInput = z.infer<typeof leadAnalysisInputSchema>;

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;

export const LEAD_RECOMMENDED_ACTIONS = [
  "schedule_call",
  "send_follow_up",
  "assign_sales_owner",
  "manual_review",
] as const;

/**
 * Structured AI output. Every field has a controlled type or bounded
 * range — nothing here accepts an arbitrary string for a value that
 * represents a business state (see PRIORITIES/RECOMMENDED_ACTIONS above).
 */
export const leadAnalysisSchema = z.object({
  intent: z.string().trim().min(1).max(100),
  industry: z.string().trim().min(1).max(100).nullable(),
  priority: z.enum(LEAD_PRIORITIES),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  recommended_action: z.enum(LEAD_RECOMMENDED_ACTIONS),
  reasoning_summary: z.string().trim().min(1).max(1000),
});

export type LeadAnalysis = z.infer<typeof leadAnalysisSchema>;
