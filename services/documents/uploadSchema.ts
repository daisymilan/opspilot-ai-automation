import { z } from "zod";

export const DOCUMENT_ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — see docs/document-intelligence.md#security

/**
 * Validates the uploaded File's metadata before any bytes are read. The
 * MIME type here is the browser's claim, not trusted on its own —
 * uploadDocument.ts sniffs magic bytes server-side as the real check; this
 * only rejects an obviously-wrong upload early with a clear message.
 */
export const uploadDocumentSchema = z.object({
  file: z
    .instanceof(File, { message: "A file is required" })
    .refine((file) => file.size > 0, "File is empty")
    .refine((file) => file.size <= DOCUMENT_MAX_SIZE_BYTES, "File exceeds the 10MB size limit"),
});
