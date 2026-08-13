"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createLeadAndAnalyze } from "./createLeadAndAnalyze";
import type { CreateLeadActionState } from "./types";

export async function createLeadAction(
  _prevState: CreateLeadActionState,
  formData: FormData,
): Promise<CreateLeadActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await createLeadAndAnalyze(
    supabase,
    {
      name: formData.get("name"),
      email: formData.get("email"),
      company: formData.get("company"),
      message: formData.get("message"),
      source: "manual",
    },
    user?.id ?? null,
  );

  if (result.error || !result.lead) {
    return { error: result.error ?? "Failed to create lead" };
  }

  // Lead creation itself succeeded even if triggering analysis didn't —
  // that failure is recorded on the execution record and visible on the
  // lead detail page itself, not passed through here.
  redirect(`/leads/${result.lead.id}`);
}
