import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CreateLeadForm } from "@/components/leads/CreateLeadForm";
import { createClient } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, company, email, status, source, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-black/60 dark:text-white/60">
          Create a lead to trigger the AI Lead Intelligence pipeline (n8n → Claude → structured
          analysis → business rules → optional human approval).
        </p>
      </div>

      <CreateLeadForm />

      <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-left text-black/50 dark:text-white/50">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads && leads.length > 0 ? (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.name}
                    </Link>
                    {lead.email ? (
                      <div className="text-xs text-black/50 dark:text-white/50">{lead.email}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {lead.company ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{lead.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">{lead.source}</td>
                  <td className="px-4 py-3 text-black/50 dark:text-white/50">
                    {new Date(lead.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black/50 dark:text-white/50">
                  No leads yet — create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
