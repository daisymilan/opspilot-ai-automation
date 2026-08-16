import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EXECUTION_STATUS_TONE } from "@/components/status/tone";
import { createClient } from "@/lib/supabase/server";
import { getExecutionsList } from "@/services/executions/getExecutions";
import {
  EXECUTION_STATUSES,
  formatDuration,
  type ExecutionStatus,
} from "@/services/executions/formatting";

const PAGE_SIZE = 20;

function isExecutionStatus(value: string): value is ExecutionStatus {
  return (EXECUTION_STATUSES as string[]).includes(value);
}

export default async function ExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : undefined;
  const status = statusParam && isExecutionStatus(statusParam) ? statusParam : undefined;
  const from = typeof params.from === "string" && params.from ? params.from : undefined;
  const to = typeof params.to === "string" && params.to ? params.to : undefined;
  const pageParam = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const supabase = await createClient();
  const { executions, total, pageSize } = await getExecutionsList(supabase, {
    status,
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (status) next.set("status", status);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (targetPage > 1) next.set("page", String(targetPage));
    const qs = next.toString();
    return qs ? `/executions?${qs}` : "/executions";
  }

  const hasFilters = Boolean(status || from || to);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Executions</h1>
        <p className="text-black/60 dark:text-white/60">
          Every automation run for this organization: status, timing, retries, and errors.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-black/10 dark:border-white/10 p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-medium text-black/50 dark:text-white/50">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? "all"}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            {EXECUTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-xs font-medium text-black/50 dark:text-white/50">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ""}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-xs font-medium text-black/50 dark:text-white/50">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ""}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/executions"
            className="text-sm text-black/50 dark:text-white/50 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-left text-black/50 dark:text-white/50">
              <th className="px-4 py-2 font-medium">Entity</th>
              <th className="px-4 py-2 font-medium">Workflow</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Started</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Retries</th>
            </tr>
          </thead>
          <tbody>
            {executions.length > 0 ? (
              executions.map((execution) => (
                <tr
                  key={execution.id}
                  className="border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/executions/${execution.id}`}
                      className="font-medium hover:underline"
                    >
                      {execution.leadName ?? execution.entity_id ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {execution.workflow_name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={EXECUTION_STATUS_TONE[execution.status]}>
                      {execution.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-black/50 dark:text-white/50">
                    {new Date(execution.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {formatDuration(execution.duration_ms)}
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {execution.retry_count}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black/50 dark:text-white/50">
                  {hasFilters ? "No executions match these filters." : "No executions yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-black/50 dark:text-white/50">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-4">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="hover:underline">
                ← Previous
              </Link>
            ) : (
              <span className="text-black/30 dark:text-white/30">← Previous</span>
            )}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="hover:underline">
                Next →
              </Link>
            ) : (
              <span className="text-black/30 dark:text-white/30">Next →</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
