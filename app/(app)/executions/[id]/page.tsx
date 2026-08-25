import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { APPROVAL_STATUS_TONE, EXECUTION_STATUS_TONE } from "@/components/status/tone";
import { ExecutionTimeline } from "@/components/executions/ExecutionTimeline";
import { RetryExecutionButton } from "@/components/executions/RetryExecutionButton";
import { createClient } from "@/lib/supabase/server";
import { getExecutionDetail } from "@/services/executions/getExecutionDetail";
import { canRetryExecution } from "@/services/executions/retryRules";
import { formatDuration } from "@/services/executions/formatting";

const PRIORITY_TONE = { low: "neutral", medium: "warning", high: "danger" } as const;

export default async function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS-scoped read — an execution belonging to another org simply isn't
  // found, giving a 404 rather than a cross-tenant data leak (same
  // pattern as /leads/[id]).
  const detail = await getExecutionDetail(supabase, id);
  if (!detail) notFound();

  const { execution, lead, score, document, extraction, approval, auditEvents, siblingExecutions } =
    detail;

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <Link
          href="/executions"
          className="text-sm text-black/50 dark:text-white/50 hover:underline"
        >
          ← Executions
        </Link>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl font-semibold">
              {lead?.name ?? document?.file_name ?? execution.entity_id ?? execution.workflow_name}
            </h1>
            <p className="text-sm text-black/60 dark:text-white/60">{execution.workflow_name}</p>
          </div>
          <Badge tone={EXECUTION_STATUS_TONE[execution.status]}>
            {execution.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-black/50 dark:text-white/50">Started</dt>
        <dd>{new Date(execution.started_at).toLocaleString()}</dd>
        <dt className="text-black/50 dark:text-white/50">Completed</dt>
        <dd>{execution.completed_at ? new Date(execution.completed_at).toLocaleString() : "—"}</dd>
        <dt className="text-black/50 dark:text-white/50">Duration</dt>
        <dd>{formatDuration(execution.duration_ms)}</dd>
        <dt className="text-black/50 dark:text-white/50">Retry count</dt>
        <dd>{execution.retry_count}</dd>
      </section>

      {execution.error_message ? (
        <section className="rounded-lg border border-red-600/30 bg-red-600/5 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-red-700 dark:text-red-400">Failure details</h2>
          <p className="text-sm text-red-700 dark:text-red-400 break-words">
            {execution.error_message}
          </p>
          {canRetryExecution(execution) ? (
            <RetryExecutionButton executionId={execution.id} />
          ) : null}
        </section>
      ) : null}

      {score ? (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium">AI analysis</h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone={PRIORITY_TONE[score.priority]}>{score.priority} priority</Badge>
            <Badge>score {score.score}/100</Badge>
            <Badge>confidence {(score.confidence * 100).toFixed(0)}%</Badge>
            <Badge>{score.recommended_action.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-black/70 dark:text-white/70">{score.reasoning_summary}</p>
        </section>
      ) : null}

      {extraction ? (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-medium">Document extraction</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>confidence {(extraction.confidence * 100).toFixed(0)}%</Badge>
            {extraction.amount != null ? (
              <Badge>
                {extraction.amount.toFixed(2)} {extraction.currency ?? ""}
              </Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-black/50 dark:text-white/50">Vendor</dt>
            <dd>{extraction.vendor_name ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Invoice number</dt>
            <dd>{extraction.invoice_number ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Due date</dt>
            <dd>{extraction.due_date ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Model</dt>
            <dd className="font-mono text-xs">{extraction.model}</dd>
          </dl>
        </section>
      ) : null}

      {approval ? (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-medium">Approval</h2>
          <Badge tone={APPROVAL_STATUS_TONE[approval.status]}>{approval.status}</Badge>
          <p className="text-sm text-black/60 dark:text-white/60">
            Action: {approval.action_type.replace(/_/g, " ")}
          </p>
          {approval.rejection_reason ? (
            <p className="text-sm text-red-600 dark:text-red-400">{approval.rejection_reason}</p>
          ) : null}
          <Link
            href="/approvals"
            className="text-xs text-black/50 dark:text-white/50 hover:underline w-fit"
          >
            View in Approvals →
          </Link>
        </section>
      ) : null}

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5">
        <h2 className="text-sm font-medium mb-4">Timeline</h2>
        <ExecutionTimeline execution={execution} auditEvents={auditEvents} />
      </section>

      {siblingExecutions.length > 0 ? (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-2">
          <h2 className="text-sm font-medium mb-1">Other executions for this entity</h2>
          <div className="flex flex-col gap-1">
            {siblingExecutions.map((sibling) => (
              <Link
                key={sibling.id}
                href={`/executions/${sibling.id}`}
                className="flex items-center justify-between gap-4 text-sm hover:underline"
              >
                <span>
                  {new Date(sibling.started_at).toLocaleString()} · attempt {sibling.retry_count}
                </span>
                <Badge tone={EXECUTION_STATUS_TONE[sibling.status]}>
                  {sibling.status.replace("_", " ")}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
