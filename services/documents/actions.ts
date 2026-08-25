"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/services/auth/getCurrentProfile";
import { createDocumentAndAnalyze } from "./createDocumentAndAnalyze";
import type { UploadDocumentActionState } from "./types";

export async function uploadDocumentAction(
  _prevState: UploadDocumentActionState,
  formData: FormData,
): Promise<UploadDocumentActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Not authenticated" };

  const supabase = await createClient();

  const result = await createDocumentAndAnalyze(
    supabase,
    profile.organizationId,
    profile.id,
    { file: formData.get("file") },
  );

  if (result.error || !result.document) {
    return { error: result.error ?? "Failed to upload document" };
  }

  // Upload itself succeeded even if triggering analysis didn't — that
  // failure is recorded on the execution record and visible on the
  // document detail page itself, not passed through here. Mirrors
  // services/leads/actions.ts's createLeadAction.
  redirect(`/documents/${result.document.id}`);
}
