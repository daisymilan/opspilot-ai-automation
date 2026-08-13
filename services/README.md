# services/

Application/business-logic layer, kept separate from both the UI (`app/`, `components/`)
and orchestration (`workflows/`):

- `services/auth/` — signup/signin/signout Server Actions, current-profile resolution
- `services/leads/` — lead intake, the create-lead-and-trigger-analysis orchestration,
  the lead-intelligence pipeline, and business rules
- `services/ai/` — provider-agnostic AI interface, the real Claude provider, and a
  deterministic test provider (never used in production)
- `services/n8n/` — the webhook adapter that triggers n8n workflows
- `services/audit/` — the single write path for `audit_logs`

Each external integration (Claude, n8n) is a documented adapter/interface with an
explicit failure mode when unconfigured — never a hard-coded fake response pretending to
be a real integration. See [docs/lead-intelligence.md](../docs/lead-intelligence.md) for
the full lead-intelligence architecture.
