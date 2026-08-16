import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { deriveAiProviderHealth, type AiProviderHealth } from "./aiProviderHealth";

export type ServiceHealthState = "healthy" | "unreachable" | "not_configured" | "error";

export interface ServiceHealth {
  state: ServiceHealthState;
  label: string;
  detail?: string;
}

export interface SystemHealth {
  application: ServiceHealth;
  database: ServiceHealth;
  n8n: ServiceHealth;
  aiProvider: AiProviderHealth;
}

async function checkDatabaseHealth(supabase: SupabaseClient<Database>): Promise<ServiceHealth> {
  const { error } = await supabase.from("organizations").select("id").limit(1);
  if (error) {
    return { state: "error", label: "Error", detail: error.message };
  }
  return { state: "healthy", label: "Healthy" };
}

/** Real network call to the configured n8n instance — not inferred, not assumed. */
async function checkN8nHealth(): Promise<ServiceHealth> {
  const baseUrl = process.env.N8N_BASE_URL;
  if (!baseUrl) {
    return { state: "not_configured", label: "Not configured" };
  }
  try {
    const response = await fetch(new URL("/healthz", baseUrl), {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok
      ? { state: "healthy", label: "Healthy" }
      : { state: "unreachable", label: "Unreachable", detail: `HTTP ${response.status}` };
  } catch (err) {
    return {
      state: "unreachable",
      label: "Unreachable",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getSystemHealth(supabase: SupabaseClient<Database>): Promise<SystemHealth> {
  const [database, n8n, { data: recentExecution }] = await Promise.all([
    checkDatabaseHealth(supabase),
    checkN8nHealth(),
    supabase
      .from("workflow_executions")
      .select("status, error_message")
      .eq("workflow_name", "lead_intelligence")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const aiProvider = deriveAiProviderHealth({
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    mostRecentExecution: recentExecution ?? null,
  });

  return {
    // If this code is executing, the app itself is serving requests —
    // there's no meaningful separate check for "am I running."
    application: { state: "healthy", label: "Running" },
    database,
    n8n,
    aiProvider,
  };
}
