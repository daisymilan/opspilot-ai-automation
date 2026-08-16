import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EXECUTION_STATUS_TONE } from "@/components/status/tone";
import { formatDuration } from "@/services/executions/formatting";
import type { RecentExecution } from "@/services/dashboard/getMetrics";

export function RecentExecutionsTable({ executions }: { executions: RecentExecution[] }) {
  return (
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
                No executions yet — create a lead to trigger one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
