# workflows/

n8n is responsible for orchestration and third-party integrations (webhooks, retries,
scheduling, cross-system calls). n8n workflows call into the application's `services/`
layer (via API routes) for business logic — they do not reimplement business rules
themselves.

- `lead-intelligence.json` — the AI Lead Intelligence workflow (Phase 2). Real, exported
  n8n workflow JSON, validated by importing it into a running local n8n instance. See
  [docs/lead-intelligence.md](../docs/lead-intelligence.md) for the architecture, the
  node-by-node breakdown, and exactly how to import and run it locally.
