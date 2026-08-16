// Pure formatting/aggregation helpers — no DB, no Next.js. The dashboard
// and executions pages fetch real rows and pass them through these.

export type ExecutionStatus =
  "pending" | "running" | "succeeded" | "failed" | "retrying" | "waiting_approval";

export const EXECUTION_STATUSES: ExecutionStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "retrying",
  "waiting_approval",
];

export interface ExecutionSummaryInput {
  status: ExecutionStatus;
  duration_ms: number | null;
}

export interface ExecutionMetrics {
  total: number;
  succeeded: number;
  failed: number;
  waitingApproval: number;
  inProgress: number;
  averageDurationMs: number | null;
}

const IN_PROGRESS_STATUSES = new Set<ExecutionStatus>(["pending", "running", "retrying"]);

/** Real aggregation over real rows — never invents a total. An empty list produces all-zero metrics. */
export function summarizeExecutions(executions: ExecutionSummaryInput[]): ExecutionMetrics {
  const total = executions.length;
  let succeeded = 0;
  let failed = 0;
  let waitingApproval = 0;
  let inProgress = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const execution of executions) {
    if (execution.status === "succeeded") succeeded += 1;
    else if (execution.status === "failed") failed += 1;
    else if (execution.status === "waiting_approval") waitingApproval += 1;
    else if (IN_PROGRESS_STATUSES.has(execution.status)) inProgress += 1;

    if (execution.duration_ms != null) {
      durationSum += execution.duration_ms;
      durationCount += 1;
    }
  }

  return {
    total,
    succeeded,
    failed,
    waitingApproval,
    inProgress,
    averageDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
  };
}

/** null/undefined -> "—" (still running, or never recorded) rather than "0s" or "NaN". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainderSeconds}s`;
}

export function formatActionLabel(value: string): string {
  return value.replace(/_/g, " ");
}
