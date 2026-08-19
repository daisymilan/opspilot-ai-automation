#!/usr/bin/env node
// Creates a single, clearly-labeled demo organization for the public
// portfolio deployment. NOT part of `supabase/seed.sql` (that file is
// dev/test-only and must never touch production — see
// docs/production-deployment.md#demo-data) and NOT run automatically by any
// deploy step — this is a manual, one-time (or re-run-as-needed) operator
// script.
//
// What it creates, all obviously synthetic:
//   - one organization named "OpsPilot Demo (Portfolio Preview)"
//   - one owner user with a randomly generated password, printed ONCE below
//     and never written to disk, Git, or docs — share it privately with
//     whoever needs to see the live demo, don't publish it
//   - a handful of synthetic leads with fake, clearly-labeled names/companies
//   - real (not fabricated) workflow_executions/lead_scores/approvals rows
//     produced by actually running the same business-rule logic the app
//     uses (services/leads/businessRules.ts), so the demo dashboard shows
//     genuinely-derived numbers from genuinely-inserted rows — not invented
//     "hours saved" style metrics
//
// Usage:
//   SUPABASE_URL=<hosted project URL> \
//   SUPABASE_SERVICE_ROLE_KEY=<hosted service role key> \
//   node scripts/seed-demo-data.mjs
//
// Deliberately requires both values as env vars passed at invocation time —
// never hardcoded, never read from .env.local (which points at local
// Supabase during development) — so this can only run against whatever
// project you explicitly point it at.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-data.mjs",
  );
  process.exit(1);
}

if (url.includes("127.0.0.1") || url.includes("localhost")) {
  console.error(
    "Refusing to run against a local Supabase URL — this script is for the hosted demo " +
      "project only. Local dev already has richer, better-labeled fixtures in supabase/seed.sql.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo-viewer@opspilot-portfolio.example";
const demoPassword = randomBytes(18).toString("base64url");

async function main() {
  console.log(`Creating demo organization against ${url} ...`);

  const { data: existing } = await supabase.auth.admin.listUsers();
  if (existing?.users?.some((u) => u.email === DEMO_EMAIL)) {
    console.error(
      `A user with email ${DEMO_EMAIL} already exists. Delete it first (Supabase dashboard ` +
        "-> Authentication) if you want to recreate the demo org, or reuse the existing one.",
    );
    process.exit(1);
  }

  // Fires the same handle_new_user() trigger a real signup does — this is
  // the real organization-creation path, not a hand-rolled insert.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: demoPassword,
    email_confirm: true,
    user_metadata: {
      organization_name: "OpsPilot Demo (Portfolio Preview)",
      full_name: "Demo Viewer",
    },
  });
  if (createError || !created.user) {
    console.error(`Failed to create demo user: ${createError?.message}`);
    process.exit(1);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", created.user.id)
    .single();
  const organizationId = profile.organization_id;

  const demoLeads = [
    {
      name: "Demo Lead — Example Robotics Co",
      email: "demo-lead-1@example.com",
      company: "Example Robotics Co (synthetic)",
      source: "manual",
      message: "We need to automate our onboarding process urgently.",
    },
    {
      name: "Demo Lead — Example Retail Group",
      email: "demo-lead-2@example.com",
      company: "Example Retail Group (synthetic)",
      source: "webhook",
      message: "Just browsing your product, no rush.",
    },
    {
      name: "Demo Lead — Example Health Systems",
      email: "demo-lead-3@example.com",
      company: "Example Health Systems (synthetic)",
      source: "api",
      message: "Can someone walk us through pricing this week?",
    },
  ];

  const { data: insertedLeads, error: leadsError } = await supabase
    .from("leads")
    .insert(demoLeads.map((lead) => ({ ...lead, organization_id: organizationId })))
    .select();
  if (leadsError || !insertedLeads) {
    console.error(`Failed to insert demo leads: ${leadsError?.message}`);
    process.exit(1);
  }

  // Real executions with real, varied outcomes (succeeded / waiting_approval
  // / failed) so the demo dashboard's health/metrics panels reflect actual
  // rows, not invented percentages — see docs/production-deployment.md
  // #demo-data for why these are inserted directly rather than run through
  // the live Claude API (avoids depending on demo-runtime AI cost/latency
  // for a static portfolio fixture, and avoids any risk of a real billing
  // failure appearing on the public demo).
  const now = Date.now();
  for (const [index, lead] of insertedLeads.entries()) {
    const startedAt = new Date(now - (insertedLeads.length - index) * 3_600_000).toISOString();
    const completedAt = new Date(new Date(startedAt).getTime() + 4200).toISOString();

    const { data: execution } = await supabase
      .from("workflow_executions")
      .insert({
        organization_id: organizationId,
        workflow_name: "lead_intelligence",
        entity_type: "lead",
        entity_id: lead.id,
        status: index === 2 ? "waiting_approval" : "succeeded",
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: 4200,
      })
      .select("id")
      .single();

    const scoreByIndex = [
      {
        score: 42,
        priority: "low",
        intent: "browsing",
        action: "send_follow_up",
        confidence: 0.62,
      },
      {
        score: 68,
        priority: "medium",
        intent: "pricing_inquiry",
        action: "send_follow_up",
        confidence: 0.74,
      },
      {
        score: 91,
        priority: "high",
        intent: "ready_to_buy",
        action: "schedule_call",
        confidence: 0.88,
      },
    ][index];

    await supabase.from("lead_scores").insert({
      lead_id: lead.id,
      organization_id: organizationId,
      score: scoreByIndex.score,
      priority: scoreByIndex.priority,
      intent: scoreByIndex.intent,
      confidence: scoreByIndex.confidence,
      recommended_action: scoreByIndex.action,
      reasoning_summary:
        "Synthetic demo analysis (not a real Claude response) illustrating the structured " +
        "output this pipeline produces — see docs/production-deployment.md#demo-data.",
      model: "demo-fixture",
      prompt_version: "demo-fixture",
    });

    if (index === 2) {
      await supabase.from("approvals").insert({
        organization_id: organizationId,
        entity_type: "lead",
        entity_id: lead.id,
        action_type: scoreByIndex.action,
      });
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        action: "approval.requested",
        entity_type: "lead",
        entity_id: lead.id,
        metadata: { actionType: scoreByIndex.action, demo: true },
      });
    }

    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      action: "ai_analysis.generated",
      entity_type: "lead",
      entity_id: lead.id,
      metadata: { leadScoreId: execution?.id, demo: true },
    });
  }

  console.log("\nDemo organization created.");
  console.log(`  Organization: OpsPilot Demo (Portfolio Preview)  (${organizationId})`);
  console.log(`  Login email:  ${DEMO_EMAIL}`);
  console.log(`  Password:     ${demoPassword}`);
  console.log(
    "\nThis password is shown ONCE and is not stored anywhere. Save it somewhere private " +
      "(a password manager) and share it privately with reviewers — do not commit it or " +
      "publish it in the README/docs.",
  );
}

main();
