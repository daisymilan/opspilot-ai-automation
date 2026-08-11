# tests/

- `tests/unit/` — Vitest unit tests for `lib/` and `services/` logic. No
  external dependencies; run with `npm test`, safe in CI.
- `tests/integration/` — Vitest tests against a real local Supabase instance
  (not mocked), exercising actual RLS policies. Run with
  `npm run test:integration`; requires `npm run db:start` + `npm run db:reset`
  first (Docker). See [docs/development-setup.md](../docs/development-setup.md#testing).
- `tests/e2e/` — Playwright end-to-end tests against the running app. Not
  configured yet — added once there's a UI flow substantial enough to
  warrant browser-level testing.
