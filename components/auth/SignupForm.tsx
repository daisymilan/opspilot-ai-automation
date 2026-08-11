"use client";

import { useActionState } from "react";
import { signUp } from "@/services/auth/actions";
import { initialAuthActionState } from "@/services/auth/types";

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialAuthActionState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="organizationName" className="text-sm font-medium">
          Organization name
        </label>
        <input
          id="organizationName"
          name="organizationName"
          type="text"
          required
          placeholder="Acme Ops"
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoComplete="name"
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
          required
          autoComplete="email"
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
        />
        <p className="text-xs text-black/50 dark:text-white/50">At least 8 characters.</p>
      </div>

      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {isPending ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}
