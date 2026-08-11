import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default async function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PagePlaceholder
      title={`Execution ${id}`}
      description="Full execution trace: steps, durations, retries, errors, and related audit log entries."
      phase="Populated once workflow execution tracking exists"
    />
  );
}
