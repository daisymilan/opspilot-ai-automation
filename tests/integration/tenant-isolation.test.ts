// Integration tests against a REAL local Supabase/Postgres instance — not
// mocked. They exercise the actual RLS policies from supabase/migrations/,
// so they require:
//   1. Docker running
//   2. `npm run db:start` (first run downloads the local Supabase images)
//   3. `npm run db:reset` (applies migrations + supabase/seed.sql)
//   4. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY set to the
//      local instance's values (printed by `db:start`) — see .env.example
//
// Run with `npm run test:integration`. `npm test` does not include this
// suite, so CI without a local Supabase instance is unaffected.
import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, requireLocalSupabase, requireServiceRoleClient, signInAs } from "./helpers";

beforeAll(() => {
  requireLocalSupabase();
});

describe("auth boundary", () => {
  it("denies leads access to an unauthenticated (anon) request", async () => {
    const client = anonClient();
    const { data, error } = await client.from("leads").select("*");

    // leads has no grant for the `anon` role (see supabase/migrations),
    // so this is denied before RLS even evaluates.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("lets an authenticated user read only their own organization's leads", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");

    const { data: acmeLeads, error: acmeError } = await acme.from("leads").select("*");
    const { data: globexLeads, error: globexError } = await globex.from("leads").select("*");

    expect(acmeError).toBeNull();
    expect(globexError).toBeNull();
    expect(acmeLeads!.length).toBeGreaterThan(0);
    expect(globexLeads!.length).toBeGreaterThan(0);
    expect(acmeLeads!.every((lead) => lead.company !== "Wardenclyffe Co")).toBe(true);
    expect(globexLeads!.every((lead) => lead.company === "Wardenclyffe Co")).toBe(true);
  });

  it("does not leak another organization's lead by direct id lookup", async () => {
    const globex = await signInAs("owner@globex.dev");
    const { data: globexLead, error: findError } = await globex
      .from("leads")
      .select("id")
      .eq("company", "Wardenclyffe Co")
      .limit(1)
      .single();

    expect(findError).toBeNull();
    expect(globexLead).not.toBeNull();

    const acme = await signInAs("owner@acme-ops.dev");
    const { data: leaked, error: leakError } = await acme
      .from("leads")
      .select("*")
      .eq("id", globexLead!.id);

    expect(leakError).toBeNull();
    expect(leaked).toEqual([]);
  });

  it("does not let one organization see the other's team members", async () => {
    const globex = await signInAs("owner@globex.dev");
    const { data: profiles, error } = await globex.from("profiles").select("email");

    expect(error).toBeNull();
    expect(profiles!.every((profile) => !profile.email.endsWith("@acme-ops.dev"))).toBe(true);
  });
});

describe("lead creation", () => {
  it("creates a lead for an authorized user, organization_id defaulting server-side", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { data, error } = await acme
      .from("leads")
      .insert({ name: "Integration Test Lead", source: "manual" })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe("Integration Test Lead");
    expect(data?.status).toBe("new");
  });

  it("rejects an empty name at the database level, independent of app-side validation", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { error } = await acme.from("leads").insert({ name: "" });

    expect(error).not.toBeNull();
  });

  it("rejects a client attempt to write another organization's id", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");

    const { data: globexProfile } = await globex
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@globex.dev")
      .single();

    const { error } = await acme
      .from("leads")
      .insert({ name: "Cross-tenant attempt", organization_id: globexProfile!.organization_id });

    // Blocked by the leads_insert_own_org WITH CHECK policy.
    expect(error).not.toBeNull();
  });
});

// Phase 5 (AI Document Intelligence) — same tenant-isolation shape as
// leads/lead_scores above, exercised against the new documents /
// document_extractions tables and the documents storage bucket's RLS.
describe("document tenant isolation", () => {
  it("lets an authenticated user read only their own organization's documents", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");

    const { data: acmeDoc, error: acmeInsertError } = await acme
      .from("documents")
      .insert({
        file_path: `acme-tenant-test/${crypto.randomUUID()}/invoice.pdf`,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      })
      .select()
      .single();
    expect(acmeInsertError).toBeNull();

    const { data: acmeDocs, error: acmeError } = await acme.from("documents").select("*");
    const { data: globexDocs, error: globexError } = await globex.from("documents").select("*");

    expect(acmeError).toBeNull();
    expect(globexError).toBeNull();
    expect(acmeDocs!.some((doc) => doc.id === acmeDoc!.id)).toBe(true);
    expect(globexDocs!.every((doc) => doc.id !== acmeDoc!.id)).toBe(true);
  });

  it("does not leak another organization's document by direct id lookup", async () => {
    const globex = await signInAs("owner@globex.dev");
    const { data: globexDoc, error: insertError } = await globex
      .from("documents")
      .insert({
        file_path: `globex-tenant-test/${crypto.randomUUID()}/invoice.pdf`,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const acme = await signInAs("owner@acme-ops.dev");
    const { data: leaked, error: leakError } = await acme
      .from("documents")
      .select("*")
      .eq("id", globexDoc!.id);

    expect(leakError).toBeNull();
    expect(leaked).toEqual([]);
  });

  it("rejects a client attempt to write another organization's id for documents", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");

    const { data: globexProfile } = await globex
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@globex.dev")
      .single();

    const { error } = await acme.from("documents").insert({
      file_path: `cross-tenant-test/${crypto.randomUUID()}/invoice.pdf`,
      file_name: "invoice.pdf",
      mime_type: "application/pdf",
      size_bytes: 512,
      organization_id: globexProfile!.organization_id,
    });

    // Blocked by the documents_insert_own_org WITH CHECK policy.
    expect(error).not.toBeNull();
  });

  it("keeps document_extractions read-only for authenticated clients", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { data: acmeDoc } = await acme
      .from("documents")
      .insert({
        file_path: `acme-extraction-test/${crypto.randomUUID()}/invoice.pdf`,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      })
      .select()
      .single();

    const { error } = await acme.from("document_extractions").insert({
      document_id: acmeDoc!.id,
      confidence: 0.9,
      model: "test-model",
      prompt_version: "v1",
    });

    // No insert grant for authenticated — service role only, same as lead_scores.
    expect(error).not.toBeNull();
  });

  it("lets an authenticated user read only their own organization's document_extractions", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");
    const service = requireServiceRoleClient();

    const { data: acmeDoc } = await acme
      .from("documents")
      .insert({
        file_path: `acme-extraction-visibility/${crypto.randomUUID()}/invoice.pdf`,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      })
      .select()
      .single();

    const { data: acmeExtraction, error: insertError } = await service
      .from("document_extractions")
      .insert({
        document_id: acmeDoc!.id,
        organization_id: acmeDoc!.organization_id,
        vendor_name: "Acme Test Vendor",
        confidence: 0.85,
        model: "test-model",
        prompt_version: "v1",
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: acmeVisible, error: acmeError } = await acme
      .from("document_extractions")
      .select("*")
      .eq("id", acmeExtraction!.id);
    const { data: globexVisible, error: globexError } = await globex
      .from("document_extractions")
      .select("*")
      .eq("id", acmeExtraction!.id);

    expect(acmeError).toBeNull();
    expect(globexError).toBeNull();
    expect(acmeVisible).toHaveLength(1);
    expect(globexVisible).toEqual([]);
  });

  it("rejects a document_extractions row whose org doesn't match its document's org", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");
    const service = requireServiceRoleClient();

    const { data: acmeDoc } = await acme
      .from("documents")
      .insert({
        file_path: `acme-mismatch-test/${crypto.randomUUID()}/invoice.pdf`,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      })
      .select()
      .single();
    const { data: globexProfile } = await globex
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@globex.dev")
      .single();

    const { error } = await service.from("document_extractions").insert({
      document_id: acmeDoc!.id,
      organization_id: globexProfile!.organization_id,
      confidence: 0.5,
      model: "test-model",
      prompt_version: "v1",
    });

    // Blocked by document_extractions_validate_document_trigger.
    expect(error).not.toBeNull();
  });
});

describe("documents storage bucket RLS", () => {
  it("lets an authenticated user upload only under their own organization's path prefix", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const { data: acmeProfile } = await acme
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@acme-ops.dev")
      .single();

    const ownPath = `${acmeProfile!.organization_id}/${crypto.randomUUID()}/test.png`;
    const { error: ownUploadError } = await acme.storage
      .from("documents")
      .upload(ownPath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

    expect(ownUploadError).toBeNull();
  });

  it("denies uploading under another organization's path prefix", async () => {
    const acme = await signInAs("owner@acme-ops.dev");
    const globex = await signInAs("owner@globex.dev");
    const { data: globexProfile } = await globex
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@globex.dev")
      .single();

    const otherOrgPath = `${globexProfile!.organization_id}/${crypto.randomUUID()}/test.png`;
    const { error } = await acme.storage
      .from("documents")
      .upload(otherOrgPath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

    // Blocked by documents_bucket_insert_own_org.
    expect(error).not.toBeNull();
  });

  it("denies reading an object under another organization's path prefix", async () => {
    const globex = await signInAs("owner@globex.dev");
    const { data: globexProfile } = await globex
      .from("profiles")
      .select("organization_id")
      .eq("email", "owner@globex.dev")
      .single();

    const globexPath = `${globexProfile!.organization_id}/${crypto.randomUUID()}/test.png`;
    await globex.storage
      .from("documents")
      .upload(globexPath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));

    const acme = await signInAs("owner@acme-ops.dev");
    const { data, error } = await acme.storage.from("documents").download(globexPath);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
