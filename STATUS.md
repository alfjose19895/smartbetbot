# SmartBetBot Status

Last updated: 2026-08-26

## Completed

- Repository audit and architecture definition.
- Next.js App Router scaffold with strict TypeScript, Tailwind CSS, ESLint, and pnpm scripts.
- Responsive, accessible landing experience with clearly labelled deterministic demo metrics.
- Minimal FastAPI scaffold with typed settings, CORS configuration, OpenAPI, and `GET /health`.
- Backend test and Ruff configuration.
- Frontend and backend environment templates with no real secrets.
- Provider-independent backend package boundaries and Supabase migration directory.
- WSL-oriented setup and architecture documentation.
- Supabase SSR clients for browser, Server Components, Server Actions, and Proxy.
- Email/password registration, confirmation callback, login, persistent session, and logout.
- Forgot-password, recovery callback, password update, and confirmation resend flows.
- Protected-route proxy using verified JWT claims and safe internal redirects.
- Authenticated dashboard and account settings foundation without simulated performance data.
- Authentication validation, safe error mapping, and 17 frontend unit tests.
- Live read-only Supabase Auth check: HTTP 200, signup/email enabled, auto-confirm disabled.
- Phase 3 PostgreSQL schema deployed to the development Supabase project through four versioned
  migrations.
- 22 public tables with constraints, indexes, update triggers, Auth profile synchronization, and
  deterministic disabled strategy seeds.
- RLS enabled on all Phase 3 tables with browser grants limited to each authenticated user's own
  profile, preferences, and push subscriptions.
- Remote database audit passed: 22 tables, 10 policies, 1 existing Auth user synchronized, four
  disabled strategies, and runtime cross-user isolation confirmed.
- Phase 4 FastAPI v1 contract implemented with 21 operations across health, fixtures, signals,
  performance, track record, account, push registration, and admin resources.
- Supabase ES256 JWT verification through cached JWKS, strict claims validation, database-backed
  admin authorization, bounded async SQLAlchemy pooling, and parameterized repositories.
- Uniform safe error envelopes, request IDs, structured logging, bounded pagination, Pydantic
  contracts, and responsible-use notices on signal/performance data.
- Remote read smoke tests passed for PostgreSQL readiness and every query family; forged JWT and
  non-admin access were rejected with `401` and `403` respectively.
- Phase 5 provider-neutral sports domain and asynchronous `SportsDataProvider` contract completed
  for leagues/coverage, teams, fixtures/live/history, events, statistics, lineups, standings, odds,
  supplementary predictions, and team-season aggregates.
- Capability discovery, bounded query contracts, safe request metadata, retry-aware provider
  exceptions, adapter registry, and lifecycle cleanup are in place for Phase 6.
- Controlled mock is deterministic and empty by default, requires `DEMO_MODE=true`, is forbidden
  in production, and never silently replaces an unavailable real provider.
- Phase 6 production `ApiFootballProvider` completed for leagues, teams, fixtures/live/history,
  events, fixture statistics, lineups, standings, prematch/live odds, optional predictions, H2H,
  and team-season statistics.
- API-Football payloads are validated and normalized behind the Phase 5 boundary; real provider
  status codes and country subdivision identifiers are mapped without leaking upstream models.
- Shared asynchronous HTTP transport now applies server-header authentication, bounded timeouts,
  pagination, exponential backoff with jitter, explicit 429/499/5xx handling, and safe errors.
- Method-specific cache TTLs and an Upstash REST implementation are ready; cache failure is
  fail-open and development currently uses the no-op cache until its credentials are configured.
- Every real external attempt can persist safe quota, latency, status, worker, and retry metadata
  to `api_usage`; credentials, authorization headers, and raw response bodies are excluded.
- Read-only API-Football smoke test passed against league 39: one normalized league/current season,
  one external request, and quota headers received. Provider predictions remain supplementary.
- Phases 7–10 ingestion completed with executable prematch, live, and odds Railway workers,
  owner-safe Upstash locks, bounded scheduling, structured `worker_runs`, and zero-call idle cycles.
- Prematch catalog/context persistence covers current seasons, teams, fixtures, standings,
  team-season statistics, H2H, covered injuries/lineups, and supplementary provider predictions. The shared odds
  service is the sole writer for both prematch and live prices.
- Live ingestion persists scores/status/minute, events, cards/substitutions, and minute-bucketed
  statistics without inferring full time from a missing live response.
- Odds ingestion supports the MVP markets, Decimal implied probability, complete-market de-vig,
  significant movement, optional own-model edge, fingerprint deduplication, and append-only history.
- The Phase 7–10 migrations are deployed: 27 public tables now pass remote lint, RLS/grant audit,
  Auth isolation, and schema verification.
- Phases 11–15 intelligence is complete: provider linking, leakage-safe historical features,
  versioned Poisson/Elo probabilities, Data Quality, Live Pressure, Smart Score, deterministic
  signal qualification, stored reasons, cooldowns, and material-change handling.
- The development model `prematch_poisson_elo:1.0.0` is active and 572 current predictions were
  persisted for the ingested fixtures. Strategies remain deliberately disabled until compatible
  market odds are available, so the signal worker does not manufacture picks.
- Phases 16–21 product delivery is complete: real-data dashboard, live and prematch analysis,
  signal detail, deterministic idempotent settlement, filtered track record, and settlement-backed
  performance metrics with losses preserved.
- Phase 22 web push is implemented with an installable manifest/service worker, FCM HTTP v1,
  register/refresh/unsubscribe, transactional signal queueing, per-user thresholds, timezone-aware
  quiet hours, delivery status, and invalid-token handling.
- Phase 23 fixed 1-unit backtesting supports date, league, market, strategy, type, probability,
  edge, Smart Score, and odds filters plus ROI/yield, net units, drawdown, and streak metrics. It
  cannot execute bets.
- Phase 24 admin is role-protected and reports database/Redis readiness, provider usage/errors/
  latency, recent signals, model, active strategies, and worker health.
- Phase 25 verification covers settlement market rules, push preferences/delivery, backtest math,
  ingestion/intelligence regressions, frontend formatting, strict types, lint, production build,
  migration integrity, RLS, and local HTTP smoke tests.
- The Phase 16–25 migration is deployed. All 31 public tables and seven phase integrity indexes
  pass remote schema, grant, policy, and cross-user isolation verification.
- Phase 26 security hardening is implemented: strict hosts/CORS/environment validation, bounded
  declared request bodies, per-user distributed API rate limiting, fail-closed cloud behavior,
  cloud HSTS, production schema hiding, API no-store headers, frontend CSP and complete product-route
  protection. Security and incident-response guidance are documented.
- Phase 27 CI/CD contracts are implemented for `develop` and `main`: independent frontend,
  backend, dependency-audit, migration, secret-template, and repository jobs; Dependabot; pinned
  Python runtime dependencies; concurrency controls; and a manual environment-protected deployment
  smoke workflow.
- Phase 28 staging artifacts are complete: isolated environment templates, deterministic preflight,
  safe database-file selection, platform/service topology, read-only remote smoke automation, and a
  detailed functional acceptance runbook.
- Phase 29 production operations are documented: controlled migration/deploy order, backups,
  rollback, incident response, environment isolation, monitoring expectations, and explicit
  go-live checks.
- Phase 30 is defined as the non-destructive final release gate because the master roadmap ends at
  Phase 29. `pnpm release:check` and the go/no-go checklist prevent local readiness from being
  confused with approval or completion of a real production deployment.

## In Progress

- None.

## Pending

- Add, review, commit, and push the current workspace files. Most of the application is still
  untracked, so GitHub cannot execute the new CI workflows until the repository contents exist in
  the remote branch.
- Provision and validate the independent staging cloud resources, then run automated and manual
  staging acceptance on an exact CI-approved commit.
- Provision production only after staging acceptance. Production remains a no-go until real odds,
  controlled signal/settlement behavior, push delivery, monitoring, and rollback ownership are
  evidenced in staging.

## Blocked

- None.

## Manual Configuration Required

- Rotate the Supabase secret key that was initially placed in `backend/.env.example`, update the
  ignored `backend/.env`, and then delete the old key. It was not committed, but rotation is the
  safest response after a secret appears in a commit-eligible file.
- Staging and production still require their own Supabase, Upstash, and Firebase projects.
- Firebase Web/VAPID and service-account variables must be added before a real push delivery smoke;
  no message was sent to an external device during Phase 25 verification.
- Development Upstash must remain configured in the ignored backend environment for distributed
  worker locks and cache; `/health/ready` reports its availability.
- The account owner must verify Supabase Auth Site URL and redirect allowlist in the Dashboard.
- End-to-end confirmation and password recovery require a manual test using a real inbox.
- Vercel and Railway projects, environment variables, and domains require account-owner setup.
- GitHub branch protection and the `staging`/`production` environments require repository-owner
  setup; the workflow files cannot apply those account-level controls by themselves.
- Local lint, typecheck, unit tests, and build do not require additional credentials. Remote
  database checks require the ignored development `DATABASE_URL`.

## Verification

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — 31 passed across seven frontend test files.
- `pnpm build` — passed; all product routes, the PWA manifest, and messaging service worker compile.
- `backend/.venv/bin/ruff check .` — passed.
- `backend/.venv/bin/ruff format --check backend/app backend/tests backend/scripts` — passed; 135
  Python files formatted.
- `backend/.venv/bin/pytest backend/tests` — 173 passed.
- `backend/.venv/bin/pip check` — passed; no broken Python requirements.
- `pip-audit` against `backend/requirements.lock` — passed; no known vulnerabilities found.
- `pnpm audit --prod --audit-level=high` — passed; no known production vulnerabilities found.
- Migration, secret-template, and deployment repository contracts — passed.
- `pnpm release:check` — passed locally; the first GitHub CI run remains pending until these files
  are committed and pushed.
- `pnpm db:push:dry` — passed before each remote migration application.
- `pnpm db:lint` — passed; the Supabase PostgreSQL linter found no schema errors.
- `pnpm db:verify` — passed; schema, grants, RLS policies, Auth trigger/backfill, seeds, and runtime
  user isolation verified against Supabase Cloud.
- Phase 4 remote smoke — passed for fixtures, signals, performance, track record, account, all four
  admin query families, database readiness, JWKS rejection, and role enforcement.
- `pnpm provider:verify` — passed against API-Football with a single read-only request; normalized
  current league data and quota metadata were returned without exposing the key.
- `python -m app.workers.{prematch,live,odds} --help` — passed for all executable entry points.
- One-cycle remote smoke passed for prematch, live, and odds; each appended a successful
  `worker_runs` record and made zero provider requests because no leagues/fixtures were targeted.
- Historical free-plan backfill passed with `PREMATCH_SEASON_OVERRIDE=2024`: 40 teams, 760 finished
  fixtures and two standings snapshots persisted across leagues 39 and 140 with zero worker errors.
- Final `pnpm db:push:dry` — passed with `upToDate=true` and no pending migrations.
- Phase 16–25 migration application and final `pnpm db:verify` — passed: 31 tables, 10 policies,
  seven integrity indexes, one synchronized Auth user, and cross-user RLS isolation.
- Settlement one-cycle smoke — succeeded with zero writes and
  `no_unsettled_terminal_signals`; the run is recorded in `worker_runs`.
- Local HTTP smoke — `/health/ready` returned ready with PostgreSQL and Redis `ok`, the frontend
  returned HTTP 200, and OpenAPI exposed live/prematch analysis, backtest, and admin overview paths.
- Phase 26–30 local smoke — the production frontend build returned its CSP/security headers,
  unauthenticated `/backtesting` redirected safely to login, and the API returned security headers
  with PostgreSQL and Redis readiness `ok`.
