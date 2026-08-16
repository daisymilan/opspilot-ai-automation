// Pure rules governing when a retry is safe. See services/executions/actions.ts
// for the actual retry action, and docs/operations-center.md for why this
// is deliberately narrow: only a `failed` execution can be retried.
// `waiting_approval` and `succeeded` executions are never retried — there
// is nothing to redo (the analysis already exists), and retrying them
// would risk misrepresenting a lead's true state.

export interface RetryableExecution {
  status: string;
}

export function canRetryExecution(execution: RetryableExecution): boolean {
  return execution.status === "failed";
}

export function computeNextRetryCount(previousRetryCount: number): number {
  return previousRetryCount + 1;
}
