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
import { anonClient, requireLocalSupabase, signInAs } from "./helpers";

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
