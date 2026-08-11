# tests/

Test suites for OpsPilot, organized by type:

- `tests/unit/` — Vitest unit tests for `lib/` and `services/` logic
- `tests/integration/` — Vitest tests exercising services against a real (test) Supabase instance
- `tests/e2e/` — Playwright end-to-end tests against the running app

Test tooling (Vitest, Playwright) will be configured when the first testable
business logic lands, alongside that code rather than in advance of it.
