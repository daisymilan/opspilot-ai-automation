import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function ApprovalsPage() {
  return (
    <PagePlaceholder
      title="Approvals"
      description="Human-in-the-loop queue for AI-recommended actions that require review before execution, per the confidence-check and business-rules gate."
      phase="Populated once the approval workflow layer exists"
    />
  );
}
