# services/

Application/business-logic layer. This is where domain rules live, kept
separate from both the UI (`app/`, `components/`) and orchestration (`workflows/`):

- AI provider adapters (Claude primary, OpenAI fallback) behind a stable interface
- Structured-output validation (Zod schemas) for every LLM response
- Lead scoring, classification, and business-rule evaluation
- Database access (Supabase client wrappers, repository-style functions)
- Approval, audit-logging, and execution-tracking logic

Each external integration should be a documented adapter/interface with an
explicit development mode — never a hard-coded fake response pretending to be
a real integration.

Nothing here yet — populated starting Phase 1.
