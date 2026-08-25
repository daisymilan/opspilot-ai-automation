import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { runDocumentAnalysisPipeline } from "@/services/documents/analyzeDocumentPipeline";

const requestBodySchema = z.object({
  executionId: z.string().uuid(),
});

/**
 * Called by n8n (never by a browser) after a document upload triggers the
 * document-intelligence webhook. Mirrors app/api/leads/[id]/analyze/route.ts
 * exactly — same shared-secret trust boundary, same fail-closed behavior.
 * See docs/document-intelligence.md and
 * services/documents/analyzeDocumentPipeline.ts for the actual pipeline.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // Fail closed: an unconfigured secret must never be treated as "no auth required."
    console.error("N8N_WEBHOOK_SECRET is not configured; rejecting analyze webhook call.");
    return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
  }

  const providedSecret = request.headers.get("x-webhook-secret") ?? "";
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  const authorized =
    expected.length === provided.length &&
    provided.length > 0 &&
    timingSafeEqual(expected, provided);

  if (!authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: documentId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = requestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: parsedBody.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  const result = await runDocumentAnalysisPipeline({
    documentId,
    executionId: parsedBody.data.executionId,
    supabase,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
