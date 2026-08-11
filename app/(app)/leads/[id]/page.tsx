import { PagePlaceholder } from "@/components/ui/PagePlaceholder";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PagePlaceholder
      title={`Lead ${id}`}
      description="Full lead record: intake data, duplicate-check result, AI classification, score, recommended action, assignment, follow-up draft, and approval history."
      phase="Populated in the AI Lead Intelligence phase"
    />
  );
}
