import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, size_bytes, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-black/60 dark:text-white/60">
          Upload an invoice to trigger the AI Document Intelligence pipeline (n8n → Claude →
          structured extraction → business rules → optional human approval).
        </p>
      </div>

      <UploadDocumentForm />

      <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-left text-black/50 dark:text-white/50">
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Size</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents && documents.length > 0 ? (
              documents.map((document) => (
                <tr
                  key={document.id}
                  className="border-b border-black/5 dark:border-white/5 last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link href={`/documents/${document.id}`} className="font-medium hover:underline">
                      {document.file_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {document.mime_type}
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">
                    {(document.size_bytes / 1024).toFixed(0)} KB
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{document.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-black/50 dark:text-white/50">
                    {new Date(document.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-black/50 dark:text-white/50">
                  No documents yet — upload one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
