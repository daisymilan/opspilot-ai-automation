import type { Database } from "@/lib/supabase/database.types";

type ExecutionRow = Database["public"]["Tables"]["workflow_executions"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "ai_analysis.generated": "AI analysis generated",
  "lead.recommendation_created": "Recommendation created",
  "approval.requested": "Approval requested",
  "approval.approved": "Approval approved",
  "approval.rejected": "Approval rejected",
  "lead_intelligence.failed": "Execution failed",
  "execution.retried": "Retry triggered",
};

interface TimelineEntry {
  timestamp: string;
  label: string;
  detail?: string;
}

function describeMetadata(metadata: Record<string, unknown>): string | undefined {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;
  if (typeof metadata.error === "string") return metadata.error;
  if (typeof metadata.rejectionReason === "string") return `Reason: ${metadata.rejectionReason}`;
  if (typeof metadata.recommendedAction === "string") {
    return `Recommended: ${metadata.recommendedAction.replace(/_/g, " ")}`;
  }
  if (typeof metadata.actionType === "string") {
    return `Action: ${metadata.actionType.replace(/_/g, " ")}`;
  }
  if (typeof metadata.score === "number") return `Score: ${metadata.score}`;
  return undefined;
}

/**
 * Built only from real rows: the execution's own started_at/completed_at
 * plus the audit_logs entries scoped to it by getExecutionDetail (see
 * that file for why time-window, not executionId, is the correlation
 * key). No step here is synthesized or estimated.
 */
export function ExecutionTimeline({
  execution,
  auditEvents,
}: {
  execution: ExecutionRow;
  auditEvents: AuditLogRow[];
}) {
  const entries: TimelineEntry[] = [
    { timestamp: execution.started_at, label: "Execution started" },
    ...auditEvents.map((event) => ({
      timestamp: event.created_at,
      label: AUDIT_ACTION_LABELS[event.action] ?? event.action.replace(/_/g, " "),
      detail: describeMetadata(event.metadata),
    })),
  ];

  if (execution.completed_at) {
    entries.push({
      timestamp: execution.completed_at,
      label:
        execution.status === "failed"
          ? "Execution failed"
          : `Execution ${execution.status.replace("_", " ")}`,
    });
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="h-2 w-2 rounded-full bg-black/40 dark:bg-white/40" />
            {index < entries.length - 1 ? (
              <span className="w-px flex-1 bg-black/10 dark:bg-white/10 mt-1" />
            ) : null}
          </div>
          <div className="pb-2">
            <p className="text-sm font-medium">{entry.label}</p>
            <p className="text-xs text-black/50 dark:text-white/50">
              {new Date(entry.timestamp).toLocaleString()}
            </p>
            {entry.detail ? (
              <p className="text-xs text-black/60 dark:text-white/60 mt-0.5 break-words">
                {entry.detail}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
