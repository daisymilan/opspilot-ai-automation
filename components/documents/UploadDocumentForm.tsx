"use client";

import { useActionState } from "react";
import { uploadDocumentAction } from "@/services/documents/actions";
import { initialUploadDocumentActionState } from "@/services/documents/types";

export function UploadDocumentForm() {
  const [state, formAction, isPending] = useActionState(
    uploadDocumentAction,
    initialUploadDocumentActionState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-black/10 dark:border-white/10 p-5"
    >
      <h2 className="text-sm font-medium">Upload invoice</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg"
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-black/5 dark:file:bg-white/10 file:px-3 file:py-1.5 file:text-sm"
        />
        <p className="text-xs text-black/50 dark:text-white/50">
          PDF, PNG, or JPEG, up to 10MB. Triggers the AI Document Intelligence pipeline (n8n →
          Claude → structured extraction → business rules → optional human approval).
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {isPending ? "Uploading…" : "Upload document"}
      </button>
    </form>
  );
}
