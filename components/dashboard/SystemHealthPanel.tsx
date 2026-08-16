import { Badge } from "@/components/ui/Badge";
import { AI_PROVIDER_HEALTH_TONE, SERVICE_HEALTH_TONE } from "@/components/status/tone";
import type { SystemHealth } from "@/services/dashboard/getSystemHealth";

const BASED_ON_LABEL = {
  not_configured: "no API key configured",
  no_recent_execution: "no lead-intelligence execution has run yet",
  most_recent_execution: "based on the most recent execution's real outcome",
} as const;

function Row({
  name,
  tone,
  label,
  sublabel,
  detail,
}: {
  name: string;
  tone: string;
  label: string;
  sublabel?: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <span className="text-sm pt-0.5">{name}</span>
      <div className="flex flex-col items-end gap-1 max-w-xs">
        <Badge tone={tone as never}>{label}</Badge>
        {sublabel ? (
          <span className="text-xs text-black/40 dark:text-white/40 text-right">{sublabel}</span>
        ) : null}
        {detail ? (
          <span className="text-xs text-black/50 dark:text-white/50 text-right break-words">
            {detail}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Every row here reflects a real, just-performed check (see
 * services/dashboard/getSystemHealth.ts) — a live fetch for n8n, a
 * trivial select for the database, and honest inference-from-history for
 * the AI provider (never a live Claude call, since that costs money; the
 * `sublabel` always discloses this so the UI never implies a check that
 * didn't happen). See docs/operations-center.md#health.
 */
export function SystemHealthPanel({ health }: { health: SystemHealth }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-5">
      <h2 className="text-sm font-medium mb-1">System health</h2>
      <div className="flex flex-col">
        <Row
          name="Application"
          tone={SERVICE_HEALTH_TONE[health.application.state]}
          label={health.application.label}
        />
        <Row
          name="Database"
          tone={SERVICE_HEALTH_TONE[health.database.state]}
          label={health.database.label}
          detail={health.database.detail}
        />
        <Row
          name="Workflow engine (n8n)"
          tone={SERVICE_HEALTH_TONE[health.n8n.state]}
          label={health.n8n.label}
          detail={health.n8n.detail}
        />
        <Row
          name="AI provider (Claude)"
          tone={AI_PROVIDER_HEALTH_TONE[health.aiProvider.state]}
          label={health.aiProvider.label}
          sublabel={BASED_ON_LABEL[health.aiProvider.basedOn]}
          detail={health.aiProvider.detail}
        />
      </div>
    </div>
  );
}
