import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/services/auth/getCurrentProfile";
import { getPendingApprovals, getRecentDecidedApprovals } from "@/services/approvals/getApprovals";

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const [profile, pending, decided] = await Promise.all([
    getCurrentProfile(),
    getPendingApprovals(supabase),
    getRecentDecidedApprovals(supabase, 10),
  ]);

  // UX convenience only — hiding the buttons is not the security boundary.
  // The server actions re-check role themselves and RLS's
  // approvals_update_reviewer policy is the real enforcement either way.
  const canReview = profile?.role === "owner" || profile?.role === "admin";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-black/60 dark:text-white/60">
          AI-recommended actions that need a human decision before they take effect.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Pending ({pending.length})
        </h2>
        {pending.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} canReview={canReview} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">Nothing waiting on review.</p>
        )}
      </div>

      {decided.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-black/50 dark:text-white/50">Recently decided</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {decided.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} canReview={canReview} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
