import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { uploadDocumentSchema, type DOCUMENT_ALLOWED_MIME_TYPES } from "./uploadSchema";

export interface UploadDocumentResult {
  data?: Database["public"]["Tables"]["documents"]["Row"];
  error?: string;
}

type AllowedMimeType = (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number];

/**
 * Magic-byte sniffing — the browser's claimed File.type is never trusted
 * on its own (see docs/document-intelligence.md#security); this is the
 * real type check. Returns null for anything that isn't one of the three
 * accepted formats, regardless of what the client claimed.
 */
function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf"; // %PDF
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png"; // \x89PNG
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"; // JPEG SOI marker
  }
  return null;
}

/**
 * Validates and uploads a document using the caller's already-authenticated
 * Supabase client (RLS-respecting), mirrors services/leads/createLead.ts.
 * Uploads to storage first, creates the documents row only on success — a
 * failed row insert cleans up the now-orphaned storage object rather than
 * leaving a file with no owning record (see docs/document-intelligence.md
 * #failure-modes).
 */
export async function uploadDocument(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  uploadedBy: string | null,
  input: unknown,
): Promise<UploadDocumentResult> {
  const parsed = uploadDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid file" };
  }
  const { file } = parsed.data;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedMimeType = sniffMimeType(bytes);
  if (!sniffedMimeType) {
    return { error: "Unsupported file type — only PDF, PNG, and JPEG are accepted" };
  }

  const documentId = crypto.randomUUID();
  const filePath = `${organizationId}/${documentId}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, bytes, { contentType: sniffedMimeType });
  if (uploadError) {
    return { error: `Failed to upload file: ${uploadError.message}` };
  }

  const { data, error: insertError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      uploaded_by: uploadedBy,
      file_path: filePath,
      file_name: file.name,
      mime_type: sniffedMimeType,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (insertError || !data) {
    await supabase.storage.from("documents").remove([filePath]);
    return {
      error: `Failed to create document record: ${insertError?.message ?? "unknown database error"}`,
    };
  }

  return { data };
}
