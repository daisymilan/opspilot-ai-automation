import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { APPROVAL_STATUS_TONE, EXECUTION_STATUS_TONE } from "@/components/status/tone";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this to the caller's own organization — a document
  // belonging to another org simply won't be found, giving a 404 rather
  // than a cross-tenant data leak. See supabase/migrations and
  // docs/document-intelligence.md#security.
  const { data: document } = await supabase.from("documents").select("*").eq("id", id).single();
  if (!document) notFound();

  const { data: extractions } = await supabase
    .from("document_extractions")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const extraction = extractions?.[0] ?? null;

  const { data: executions } = await supabase
    .from("workflow_executions")
    .select("*")
    .eq("entity_type", "document")
    .eq("entity_id", id)
    .order("started_at", { ascending: false })
    .limit(1);
  const execution = executions?.[0] ?? null;

  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("entity_type", "document")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const approval = approvals?.[0] ?? null;

  // Same ambiguity as the lead detail page: approval === null is equally
  // true when the AI succeeded and decided no approval was needed, and
  // when analysis never completed — only the execution's real status can
  // distinguish which one actually happened here.
  const approvalFallbackMessage =
    execution?.status === "succeeded"
      ? "No approval required — the extraction was low-risk and high-confidence."
      : execution?.status === "failed"
        ? "Approval decision unavailable — the AI extraction failed. See execution status above."
        : "No approval decision yet — analysis has not completed.";

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <Link href="/documents" className="text-sm text-black/50 dark:text-white/50 hover:underline">
          ← Documents
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{document.file_name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-black/60 dark:text-white/60">
          <span>{document.mime_type}</span>
          <span>{(document.size_bytes / 1024).toFixed(0)} KB</span>
          <Badge>{document.status}</Badge>
        </div>
      </div>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Execution status</h2>
        {execution ? (
          <div className="flex flex-col gap-2">
            <Badge tone={EXECUTION_STATUS_TONE[execution.status]}>
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
            No automation has run for this document yet.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Extraction</h2>
        {extraction ? (
          <div className="flex flex-col gap-3">
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
              <dt className="text-black/50 dark:text-white/50">Prompt version</dt>
              <dd className="font-mono text-xs">{extraction.prompt_version}</dd>
            </dl>
            {Array.isArray(extraction.line_items) && extraction.line_items.length > 0 ? (
              <div>
                <dt className="text-sm text-black/50 dark:text-white/50 mb-1">Line items</dt>
                <ul className="text-sm flex flex-col gap-1">
                  {(
                    extraction.line_items as {
                      description: string;
                      quantity: number | null;
                      amount: number | null;
                    }[]
                  ).map((item, index) => (
                    <li key={index} className="flex justify-between gap-4">
                      <span>
                        {item.description}
                        {item.quantity != null ? ` × ${item.quantity}` : ""}
                      </span>
                      <span className="text-black/60 dark:text-white/60">
                        {item.amount != null ? item.amount.toFixed(2) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
            <Badge tone={APPROVAL_STATUS_TONE[approval.status]}>{approval.status}</Badge>
            <p className="text-sm text-black/60 dark:text-white/60">
              Action: {approval.action_type.replace(/_/g, " ")}
            </p>
            {approval.rejection_reason ? (
              <p className="text-sm text-red-600 dark:text-red-400">{approval.rejection_reason}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">{approvalFallbackMessage}</p>
        )}
      </section>
    </div>
  );
}
