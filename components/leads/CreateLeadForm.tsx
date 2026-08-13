"use client";

import { useActionState } from "react";
import { createLeadAction } from "@/services/leads/actions";
import { initialCreateLeadActionState } from "@/services/leads/types";

export function CreateLeadForm() {
  const [state, formAction, isPending] = useActionState(
    createLeadAction,
    initialCreateLeadActionState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-black/10 dark:border-white/10 p-5"
    >
      <h2 className="text-sm font-medium">New lead</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company" className="text-sm font-medium">
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="What are they looking for?"
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-xs text-black/50 dark:text-white/50">
          This is what the AI analysis reads to classify the lead.
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create lead"}
      </button>
    </form>
  );
}
