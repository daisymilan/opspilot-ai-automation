import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default function ExecutionsPage() {
  return (
    <PagePlaceholder
      title="Executions"
      description="Observable history of every automation run: workflow name, entity, status, timing, retry count, and errors."
      phase="Populated once workflow execution tracking exists"
    />
  );
}
