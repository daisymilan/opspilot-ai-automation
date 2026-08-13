import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface AuditEventInput {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * audit_logs is append-only and service-role-write-only by design (see
 * supabase/migrations) — this helper is the one place that writes to it,
 * called with a service-role client regardless of whether the event was
 * triggered by a user action or the AI pipeline.
 */
export async function recordAuditEvent(
  supabase: SupabaseClient<Database>,
  event: AuditEventInput,
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: event.organizationId,
    actor_id: event.actorId ?? null,
    action: event.action,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    // Audit logging must never crash the flow it's observing, but a
    // failure here still needs to be loud, not silently swallowed.
    console.error("Failed to record audit event", { action: event.action, error: error.message });
  }
}
