"use client";

import { useActionState } from "react";
import { retryExecutionAction } from "@/services/executions/actions";

export function RetryExecutionButton({ executionId }: { executionId: string }) {
  const [state, formAction, isPending] = useActionState(retryExecutionAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="executionId" value={executionId} />
      {state.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {isPending ? "Retrying…" : "Retry this execution"}
      </button>
    </form>
  );
}
