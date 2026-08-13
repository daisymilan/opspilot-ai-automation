import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";

const PRIORITY_TONE = { low: "neutral", medium: "warning", high: "danger" } as const;
const EXECUTION_TONE = {
  pending: "neutral",
  running: "neutral",
  succeeded: "success",
  waiting_approval: "warning",
  failed: "danger",
  retrying: "warning",
} as const;
const APPROVAL_TONE = { pending: "warning", approved: "success", rejected: "danger" } as const;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this to the caller's own organization — a lead belonging
  // to another org simply won't be found, giving a 404 rather than a
  // cross-tenant data leak. See supabase/migrations and
  // docs/lead-intelligence.md#security.
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) notFound();

  const { data: scores } = await supabase
    .from("lead_scores")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const score = scores?.[0] ?? null;

  const { data: executions } = await supabase
    .from("workflow_executions")
    .select("*")
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .order("started_at", { ascending: false })
    .limit(1);
  const execution = executions?.[0] ?? null;

  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("entity_type", "lead")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const approval = approvals?.[0] ?? null;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <Link href="/leads" className="text-sm text-black/50 dark:text-white/50 hover:underline">
          ← Leads
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{lead.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-black/60 dark:text-white/60">
          {lead.company ? <span>{lead.company}</span> : null}
          {lead.email ? <span>{lead.email}</span> : null}
          <span>via {lead.source}</span>
        </div>
        {lead.message ? (
          <p className="mt-3 text-sm text-black/70 dark:text-white/70 border-l-2 border-black/10 dark:border-white/10 pl-3">
            {lead.message}
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Execution status</h2>
        {execution ? (
          <div className="flex flex-col gap-2">
            <Badge tone={EXECUTION_TONE[execution.status]}>
              {execution.status.replace("_", " ")}
            </Badge>
            {execution.error_message ? (
              <p className="text-sm text-red-600 dark:text-red-400">{execution.error_message}</p>
            ) : null}
            {execution.duration_ms != null ? (
              <p className="text-xs text-black/50 dark:text-white/50">
                Completed in {(execution.duration_ms / 1000).toFixed(1)}s
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">
            No automation has run for this lead yet.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">AI analysis</h2>
        {score ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={PRIORITY_TONE[score.priority]}>{score.priority} priority</Badge>
              <Badge>score {score.score}/100</Badge>
              <Badge>confidence {(score.confidence * 100).toFixed(0)}%</Badge>
              <Badge>{score.recommended_action.replace("_", " ")}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-black/50 dark:text-white/50">Intent</dt>
              <dd>{score.intent}</dd>
              <dt className="text-black/50 dark:text-white/50">Industry</dt>
              <dd>{score.industry ?? "—"}</dd>
              <dt className="text-black/50 dark:text-white/50">Model</dt>
              <dd className="font-mono text-xs">{score.model}</dd>
              <dt className="text-black/50 dark:text-white/50">Prompt version</dt>
              <dd className="font-mono text-xs">{score.prompt_version}</dd>
            </dl>
            <div>
              <dt className="text-sm text-black/50 dark:text-white/50 mb-1">Reasoning</dt>
              <dd className="text-sm">{score.reasoning_summary}</dd>
            </div>
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">
            Not analyzed yet{execution?.status === "failed" ? " — see execution status above" : ""}.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Approval</h2>
        {approval ? (
          <div className="flex flex-col gap-2">
            <Badge tone={APPROVAL_TONE[approval.status]}>{approval.status}</Badge>
            <p className="text-sm text-black/60 dark:text-white/60">
              Action: {approval.action_type.replace("_", " ")}
            </p>
            {approval.rejection_reason ? (
              <p className="text-sm text-red-600 dark:text-red-400">{approval.rejection_reason}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">
            No approval required — the recommended action was low-risk and high-confidence.
          </p>
        )}
      </section>
    </div>
  );
}
