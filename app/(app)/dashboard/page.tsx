import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="System health, execution volume, success rate, estimated time saved, pending approvals, workflow health, recent executions, and failures requiring attention."
      phase="Populated once workflow execution tracking exists"
    />
  );
}
