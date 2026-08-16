import Link from "next/link";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SystemHealthPanel } from "@/components/dashboard/SystemHealthPanel";
import { RecentExecutionsTable } from "@/components/executions/RecentExecutionsTable";
import { createClient } from "@/lib/supabase/server";
import { getDashboardMetrics, getRecentExecutions } from "@/services/dashboard/getMetrics";
import { getSystemHealth } from "@/services/dashboard/getSystemHealth";
import { formatDuration } from "@/services/executions/formatting";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Every number below is a real aggregation or a real just-performed
  // check over this org's own RLS-scoped rows — nothing here is
  // hard-coded or estimated. See docs/operations-center.md#dashboard.
  const [metrics, health, recentExecutions] = await Promise.all([
    getDashboardMetrics(supabase),
    getSystemHealth(supabase),
    getRecentExecutions(supabase, 10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-black/60 dark:text-white/60">
          Real execution volume, success rate, and service health for this organization.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Leads" value={metrics.totalLeads} />
        <KpiCard label="Analyses completed" value={metrics.analysesCompleted} />
        <KpiCard label="Executions" value={metrics.total} />
        <KpiCard label="Succeeded" value={metrics.succeeded} />
        <KpiCard label="Failed" value={metrics.failed} />
        <KpiCard label="Waiting on approval" value={metrics.waitingApproval} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-4">
          <SystemHealthPanel health={health} />
          <KpiCard
            label="Average execution duration"
            value={formatDuration(metrics.averageDurationMs)}
            hint={`Across ${metrics.total} execution${metrics.total === 1 ? "" : "s"}`}
          />
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent executions</h2>
            <Link
              href="/executions"
              className="text-xs text-black/50 dark:text-white/50 hover:underline"
            >
              View all →
            </Link>
          </div>
          <RecentExecutionsTable executions={recentExecutions} />
        </div>
      </div>

      {metrics.waitingApproval > 0 ? (
        <Link
          href="/approvals"
          className="rounded-lg border border-amber-600/30 bg-amber-600/5 p-4 text-sm text-amber-700 dark:text-amber-400 hover:bg-amber-600/10"
        >
          {metrics.waitingApproval} execution{metrics.waitingApproval === 1 ? "" : "s"} waiting on
          human approval →
        </Link>
      ) : null}
    </div>
  );
}
