# workflows/

n8n is responsible for orchestration and third-party integrations (webhooks,
retries, scheduling, cross-system calls). This directory holds:

- Exported n8n workflow JSON definitions, version-controlled
- Workflow-level documentation (trigger, steps, expected inputs/outputs)
- Any local tooling for importing/exporting workflows to/from an n8n instance

n8n workflows call into the application's `services/` layer (via API routes)
for business logic — they should not reimplement business rules themselves.

Nothing here yet — populated starting the workflow-orchestration phase.
