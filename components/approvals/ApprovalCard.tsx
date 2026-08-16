"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { APPROVAL_STATUS_TONE } from "@/components/status/tone";
import { approveApprovalAction, rejectApprovalAction } from "@/services/approvals/actions";
import type { ApprovalWithContext } from "@/services/approvals/getApprovals";

const PRIORITY_TONE = { low: "neutral", medium: "warning", high: "danger" } as const;

export function ApprovalCard({
  approval,
  canReview,
}: {
  approval: ApprovalWithContext;
  canReview: boolean;
}) {
  const [approveState, approveAction, approvePending] = useActionState(approveApprovalAction, {});
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectApprovalAction, {});
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{approval.lead?.name ?? "Unknown lead"}</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {approval.lead?.company ?? "—"}
            {approval.lead?.email ? ` · ${approval.lead.email}` : ""}
          </p>
        </div>
        <Badge tone={APPROVAL_STATUS_TONE[approval.status]}>{approval.status}</Badge>
      </div>

      <p className="text-sm">
        Recommended action:{" "}
        <span className="font-medium">{approval.action_type.replace(/_/g, " ")}</span>
      </p>

      {approval.score ? (
        <div className="flex flex-wrap gap-2">
          <Badge tone={PRIORITY_TONE[approval.score.priority]}>
            {approval.score.priority} priority
          </Badge>
          <Badge>score {approval.score.score}/100</Badge>
          <Badge>confidence {(approval.score.confidence * 100).toFixed(0)}%</Badge>
          <Badge>{approval.score.intent}</Badge>
        </div>
      ) : null}

      {approval.score?.reasoning_summary ? (
        <p className="text-sm text-black/70 dark:text-white/70 border-l-2 border-black/10 dark:border-white/10 pl-3">
          {approval.score.reasoning_summary}
        </p>
      ) : null}

      <p className="text-xs text-black/40 dark:text-white/40">
        Requested {new Date(approval.created_at).toLocaleString()}
      </p>

      {approval.status !== "pending" ? (
        <div className="text-sm text-black/60 dark:text-white/60 pt-2 border-t border-black/5 dark:border-white/5">
          {approval.status === "approved" ? "Approved" : "Rejected"}
          {approval.reviewed_at ? ` on ${new Date(approval.reviewed_at).toLocaleString()}` : ""}
          {approval.rejection_reason ? (
            <p className="text-red-600 dark:text-red-400 mt-1">
              Reason: {approval.rejection_reason}
            </p>
          ) : null}
        </div>
      ) : canReview ? (
        <div className="flex flex-col gap-3 pt-2 border-t border-black/5 dark:border-white/5">
          {approveState.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{approveState.error}</p>
          ) : null}
          {rejectState.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{rejectState.error}</p>
          ) : null}

          <div className="flex gap-2">
            <form action={approveAction}>
              <input type="hidden" name="approvalId" value={approval.id} />
              <button
                type="submit"
                disabled={approvePending || rejectPending}
                className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {approvePending ? "Approving…" : "Approve"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setShowReject((value) => !value)}
              className="rounded-md border border-black/10 dark:border-white/15 px-4 py-2 text-sm font-medium"
            >
              Reject
            </button>
          </div>

          {showReject ? (
            <form action={rejectAction} className="flex flex-col gap-2">
              <input type="hidden" name="approvalId" value={approval.id} />
              <textarea
                name="rejectionReason"
                required
                rows={2}
                placeholder="Why is this being rejected?"
                className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={rejectPending}
                className="self-start rounded-md border border-red-600/30 text-red-700 dark:text-red-400 px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {rejectPending ? "Rejecting…" : "Confirm reject"}
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-black/40 dark:text-white/40 pt-2 border-t border-black/5 dark:border-white/5">
          Only owners and admins can approve or reject.
        </p>
      )}
    </div>
  );
}
