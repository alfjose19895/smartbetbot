# SmartBetBot architecture

## Context and goals

SmartBetBot is a football-only data intelligence SaaS. Its core job is to ingest real provider
data, compute versioned probabilities, compare those estimates with market prices, and persist
explainable signals and their real outcomes. The MVP optimizes for simple local development and
cloud deployment rather than infrastructure breadth.

## System context

```text
Users
  |
  v
Next.js / React --------------------> Supabase Cloud
(Vercel)                              Auth + PostgreSQL + Realtime + RLS
  |
  v
FastAPI API <-----------------------> Upstash Redis Cloud
(Railway)                              cache + locks + cooldowns
  |
  +----> Prematch worker ----+
  +----> Live worker --------+------> API-Football adapter
  +----> Odds worker --------+
  |
  v
Feature engineering -> statistical/ML models -> probability
  -> edge / EV / data quality / live pressure -> Smart Score
  -> Signal Engine -> persisted signal -> Firebase Cloud Messaging
```

PostgreSQL is the system of record. Redis holds only short-lived caches, locks, and deduplication
state. Losing signals and settled outcomes remain immutable enough to preserve a trustworthy track
record. Generative AI may eventually verbalize structured reasons, but it never produces the
probability or qualification decision.

## Repository boundaries

```text
app/                    Next.js routes and layouts
components/             shared presentation primitives
features/               product feature components and client workflows
lib/                    framework and external-client configuration
hooks/                  reusable React hooks
types/                  shared TypeScript types
backend/app/api/         versioned HTTP transport
backend/app/core/        settings, logging, security, database, cache
backend/app/domain/      provider-independent entities and value objects
backend/app/repositories persistence ports and adapters
backend/app/services/    application orchestration
backend/app/providers/   API-Football, FCM, Upstash, explanation adapters
backend/app/signals/     scoring, qualification, cooldown, settlement
backend/app/ml/          features, training, evaluation, calibration, models
backend/app/workers/     Railway process entry points
backend/tests/           deterministic backend tests
supabase/migrations/     remote PostgreSQL schema and RLS under version control
```

Dependencies point inward: API routes and workers call services; services depend on domain ports;
providers and repositories implement those ports. Domain code must not import API-Football payload
types, FastAPI request objects, SQLAlchemy models, Firebase, or Redis clients.

## Runtime services

| Process | Public | Responsibility |
| --- | --- | --- |
| Next.js | Yes | Landing page, authenticated application, PWA |
| FastAPI | Yes | Versioned API, authorization, read models, preferences |
| Prematch worker | No | Schedules, history, standings, injuries/lineups, supplementary context |
| Live worker | No | Live state, events, statistics, pressure |
| Odds worker | No | Prices, movement, implied/fair probability, edge |

All four Python processes deploy from the same `backend/requirements.txt` on Railway without a
Dockerfile. Workers use database or Redis locks and idempotent writes so restarts and concurrent
runs do not duplicate snapshots or signals.

## Core data flow

1. A `SportsDataProvider` implementation fetches and maps provider payloads into normalized domain
   objects. Raw payloads are retained only where useful for auditing.
2. Repositories persist fixtures, events, statistic snapshots, and odds snapshots in Supabase.
3. Feature generation uses only data available at prediction time. Model versions and feature
   configuration identify every prediction.
4. Deterministic calculators produce probability, raw implied probability, de-vigged fair market
   probability when possible, edge, expected value, data quality, live pressure, and Smart Score.
5. The Signal Engine evaluates configurable strategies and stores structured qualification reasons.
6. A fingerprint and cooldown prevent duplicates, while material events may trigger reevaluation.
7. Finished fixtures are settled as won, lost, void, push, or pending. Performance and backtests use
   all eligible records with a fixed one-unit statistical stake.

## Security boundaries

- The browser receives only Supabase's publishable key; the service-role key stays server-side.
- Supabase Auth JWTs identify users. FastAPI validates issuer, audience, signature, and expiry.
- RLS restricts profiles, preferences, and push subscriptions to their owners. Internal prediction,
  worker, usage, and audit tables are not writable through anonymous browser access.
- Admin authorization is enforced server-side; hiding UI alone is never considered protection.
- Logs contain correlation IDs and operational identifiers, never secrets or complete tokens.
- CORS is an explicit per-environment allowlist.

## Environments and deployment

Development, staging, and production use separate Supabase, Upstash, and Firebase cloud projects.
The frontend deploys to Vercel; the API and three workers deploy to Railway. No Docker, local
PostgreSQL, local Redis, local Supabase, or Kubernetes component is part of the MVP.

## Phase 1 decisions

- Next.js 16 Active LTS, React 19, TypeScript strict mode, App Router, and Tailwind CSS 4 form the UI
  baseline.
- FastAPI settings are environment-driven and CORS-ready, but no external connection is opened at
  import time. This keeps liveness cheap and local setup credential-free.
- `/health` proves that the process is alive. Dependency readiness belongs to `/health/ready` and
  will be introduced with actual PostgreSQL and Redis clients.
- The landing preview uses fixed, clearly labelled illustrative data. It cannot be mistaken for a
  measured win rate or real signal history.

## Phase 2 decisions

- Supabase SSR owns session cookies across browser and Server Components; the browser never receives
  an administrative key.
- `proxy.ts` calls `getClaims()` immediately after creating its request-scoped Supabase client and
  preserves refreshed cookies and cache headers.
- Email confirmation and recovery use PKCE callbacks through `/auth/confirm`; callback destinations
  are constrained to local paths.
- Account recovery and confirmation resend use non-enumerating success messages.
- Authenticated pages are dynamically rendered and re-check verified claims after proxy routing.
- Roles remain a database concern for Phase 3. User-editable Auth metadata is not an authorization
  source.

## Phase 3 decisions

- PostgreSQL schema changes are append-only, timestamped migrations applied to Supabase Cloud with
  the repository-local CLI. Existing shared migrations are never rewritten.
- All 22 public tables have RLS enabled and default browser grants are revoked. Authenticated users
  can access only their own profile, preferences, and push subscriptions.
- The profile role is server-managed and excluded from client update grants. A protected Auth
  trigger creates profiles and preferences, including a backfill for Phase 2 users.
- Odds, statistics, predictions, signals, results, worker runs, API consumption, and audit entries
  are durable records optimized with indexes for their expected time-series access paths.
- Seeded strategies are disabled configuration defaults. They do not claim or manufacture measured
  performance.

## Phase 4 decisions

- `/api/v1` is the single versioned REST boundary. Health probes remain unversioned for Vercel and
  Railway operational use.
- FastAPI validates Supabase JWTs locally with asymmetric JWKS, strict issuer/audience/expiry
  checks, and a ten-minute key cache. The service never accepts publishable or secret API keys as
  user identity.
- SQLAlchemy's async engine owns a bounded PostgreSQL pool during the ASGI lifespan. Repositories
  use parameterized provider-neutral queries; no API-Football type enters the API contract.
- The server database connection is privileged, so every resource route requires an authenticated
  user and admin routes re-read the protected profile role from PostgreSQL.
- Uniform error envelopes and structured request logs carry correlation IDs without request bodies,
  tokens, secrets, or raw SQL errors.
- Readiness checks PostgreSQL and Upstash concurrently. Missing Upstash credentials keep readiness
  red while liveness and local development remain available.

## Phase 5 decisions

- Workers depend only on the asynchronous `SportsDataProvider` port and frozen normalized Pydantic
  models. Concrete HTTP payload types remain inside their adapter.
- Provider references pair a stable provider slug with an external string ID, avoiding assumptions
  that every future provider uses API-Football's identifiers.
- Capabilities and league-season coverage are explicit so schedulers can skip unsupported calls and
  conserve provider quota.
- Provider request metadata carries timing, quota, pagination, and cache facts without credentials
  or raw payload bodies. A safe exception hierarchy identifies retryable failures.
- API-Football predictions are supplementary context only; SmartBetBot probabilities remain the
  responsibility of its own versioned statistical/ML models.
- The controlled mock is empty by default, deterministic when injected, unavailable in production,
  and gated behind `DEMO_MODE=true`. There is no silent fallback from a missing real adapter.

## Phase 6 decisions

- `ApiFootballProvider` is the built-in `api_football` adapter. Its payload schemas, transport, and
  mappers remain entirely below the provider boundary.
- A shared asynchronous HTTP client sends `x-apisports-key` only as a server-side header. It applies
  a bounded timeout, pagination cap, exponential backoff with jitter, and safe classification of
  authentication, quota, transient, and payload failures.
- Cache keys are SHA-256 hashes of canonical endpoint parameters. Upstash stores only successful
  provider envelopes with operation-specific TTLs; PostgreSQL remains the durable history store.
- Each actual HTTP attempt, including retries, can append safe operational facts to `api_usage`.
  Cache hits report zero external requests and do not consume or record provider quota.
- The adapter observes API-Football daily and minute quota headers. It does not serialize API keys,
  authorization headers, query bodies, or raw upstream errors into logs or database telemetry.
- API-Football predictions are permanently mapped with `supplementary_only=true`. SmartBetBot's
  own probability engine remains an independent later phase.

## Phases 7–10 decisions

- Prematch, live, and odds are independent executable Railway workers. Each cycle is recorded in
  `worker_runs`, uses structured metadata, shuts down cleanly, and cannot overlap its protected
  scope when an Upstash lock is held by another replica.
- Prematch owns league/season/team/fixture catalog synchronization plus bounded standings,
  team-season statistics, H2H, covered injuries/lineups, and supplementary provider-prediction context. The odds
  service remains the only writer of prematch and live prices.
- Live discovery begins from stored active or near-kickoff candidates. An empty candidate set makes
  zero provider calls. Missing live observations are reconciled explicitly by fixture ID and never
  interpreted as a finished match merely because they disappeared from the live feed.
- Events are fingerprint-upserted, statistics use deterministic minute buckets, and shared fixture
  writes reject older observations. These rules make retries and concurrent prematch/live cycles
  converge without duplicating history or regressing terminal states.
- Odds history is append-only in PostgreSQL. A versioned fingerprint deduplicates exact observations
  without losing a later return to an earlier price; Redis is used only for temporary cache and
  owner-safe `SET NX EX` locks.
- Raw implied probability uses decimal arithmetic. Fair market probability is de-vigged only when
  every required market side is present. Edge stays null until a SmartBetBot model probability is
  available; supplementary provider predictions never become proprietary predictions.
