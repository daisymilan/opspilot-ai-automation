import { z } from "zod";

/** Normalized document representation sent to the AI. Raw file bytes, base64-encoded. */
export const documentAnalysisInputSchema = z.object({
  data: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
});

export type DocumentAnalysisInput = z.infer<typeof documentAnalysisInputSchema>;

const DOCUMENT_LINE_ITEM_MAX = 50;

/**
 * Structured AI output for an invoice extraction. Same discipline as
 * services/ai/schema.ts's leadAnalysisSchema — every field either bounded
 * or explicitly nullable (an AI extraction can genuinely fail to find a
 * field on the document; that's a real null, not an error).
 */
export const documentExtractionSchema = z.object({
  vendor_name: z.string().trim().min(1).max(200).nullable(),
  invoice_number: z.string().trim().min(1).max(100).nullable(),
  amount: z.number().min(0).nullable(),
  currency: z.string().length(3).nullable(), // ISO 4217
  due_date: z.string().date().nullable(),
  line_items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: z.number().nullable(),
        amount: z.number().min(0).nullable(),
      }),
    )
    .max(DOCUMENT_LINE_ITEM_MAX),
  confidence: z.number().min(0).max(1),
});

export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;
