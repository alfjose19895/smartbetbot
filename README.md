# SmartBetBot

SmartBetBot is a football intelligence platform that turns fixtures, live events, statistics,
market prices, and versioned model probabilities into explainable data signals. It is not an
automated betting system and does not guarantee outcomes or profit.

The repository contains the Phase 1–25 product and data pipeline plus the Phase 26–30 security,
delivery, environment-isolation, operations, and release-readiness scope: a Next.js PWA, Supabase
SSR sessions, a versioned PostgreSQL schema with RLS, a typed FastAPI v1 service, provider-neutral
sports adapters, executable ingestion/intelligence/settlement/notification workers, real
performance views, fixed-stake backtesting, CI, and controlled deployment runbooks.

## Architecture

```text
Browser / PWA (Next.js on Vercel)
        |             |
        |             +--> Supabase Cloud (Auth, PostgreSQL, Realtime, RLS)
        |
        +--> FastAPI on Railway
                 |
                 +--> prematch / live / odds workers
                 +--> API-Football adapter
                 +--> Upstash Redis Cloud (temporary state only)
                 +--> signal and probability engines
                 +--> Firebase Cloud Messaging
```

The Next.js application lives at the repository root. Python is isolated under `backend/`. See
[`docs/architecture.md`](docs/architecture.md) for boundaries, data flow, and architectural
decisions.

## Requirements

- WSL 2 with Ubuntu (recommended on Windows 11)
- Node.js 20.9 or newer
- pnpm 10 or newer
- Python 3.12 or newer
- Git

Docker, local PostgreSQL, local Redis, and local Supabase are neither required nor supported for
the MVP.

## Frontend setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. The landing-page analytics card is explicitly labelled as demo data;
it is a deterministic UI preview and is not presented as historical performance.

Authentication routes:

```text
/register
/login
/verify-email
/forgot-password
/reset-password
/dashboard
/settings
```

See [`docs/authentication.md`](docs/authentication.md) for Supabase Dashboard configuration, the
PKCE callback flow, protected routes, and the manual email checklist.

## Database migrations

Set `DATABASE_URL` in the ignored `backend/.env`, using the direct or port 5432 session-pooler URI
from Supabase Connect. Then review, apply, and audit migrations from the repository root:

```bash
pnpm db:push:dry
pnpm db:push
pnpm db:lint
pnpm db:verify
```

All 31 current public tables have RLS enabled. Browser access is limited to the authenticated user's own
profile, preferences, and push subscriptions; internal tables remain server-only. See
[`docs/database.md`](docs/database.md) for the schema map, access matrix, connection guidance, and
the development/staging/production procedure.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

The liveness endpoint is available at <http://localhost:8000/health>. Dependency readiness is at
<http://localhost:8000/health/ready>. Interactive OpenAPI docs are available at
<http://localhost:8000/docs> outside production.

The protected API resources below `/api/v1` cover fixture analysis, signals, settlement-backed
performance, track record, backtesting, account preferences, push registration, and admin telemetry. See
[`docs/api.md`](docs/api.md) for the endpoint/access matrix, Bearer authentication, error contract,
pagination, readiness behavior, and Railway command.

Run backend checks from `backend/`:

```bash
ruff check .
pytest
```

Validate the ignored development API-Football credential with one read-only request:

```bash
pnpm provider:verify
```

The API can start with Upstash unset, but `/health/ready` intentionally returns `503` until
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured.

## Sports-data provider

Workers depend on the asynchronous `SportsDataProvider` contract rather than API-Football
payloads. The `api_football` implementation normalizes leagues/coverage, teams, fixtures, live
state, events, statistics, lineups, standings, odds, supplementary provider predictions, and
historical data. The `football_data` implementation supplies free current-season competitions,
teams, fixtures, delayed live state, and standings while explicitly skipping unsupported deep
data and odds. See [`docs/sports-data-provider.md`](docs/sports-data-provider.md) for endpoint
mapping, cache TTLs, retry/rate-limit behavior, safe errors, and configuration.

Select `SPORTS_DATA_PROVIDER=api_football` with `API_FOOTBALL_KEY`, or
`SPORTS_DATA_PROVIDER=football_data` with `FOOTBALL_DATA_API_KEY`. There is no automatic fallback
to mock data.

## Environment variables

The root [`.env.example`](.env.example) contains browser-safe frontend variables. The backend uses
[`backend/.env.example`](backend/.env.example), which includes server-only credentials and signal
thresholds. Copy the templates to ignored local files. Never prefix a private credential with
`NEXT_PUBLIC_` or commit real values.

Three fully isolated environments are planned:

| Environment | Git / hosting | Supabase | Upstash | Firebase |
| --- | --- | --- | --- | --- |
| Development | local | `smartbetbot-dev` | `smartbetbot-dev` | SmartBetBot Dev |
| Staging | `develop`, Vercel preview, Railway staging | `smartbetbot-staging` | `smartbetbot-staging` | SmartBetBot Staging |
| Production | `main`, Vercel, Railway production | `smartbetbot-production` | `smartbetbot-production` | SmartBetBot Production |

No environment may share its database, cache, Firebase project, or secrets with another.

## External service setup

The development Supabase Auth project and sports-provider credentials are connected through ignored
environment files. Development Upstash and Firebase Cloud Messaging still require account-owner
configuration. Create separate cloud projects for each environment, place credentials in the
appropriate ignored env file, and keep migrations in Git.

## Security and release validation

Run the complete local release gate before opening or merging a release pull request:

```bash
pnpm release:check
```

It runs frontend lint/types/tests/build, backend lint/tests/dependency checks, production dependency
audits, and the migration, secret-template, and deployment contracts. GitHub Actions repeats these
checks for `develop` and `main`; the manual deployment workflow performs read-only staging or
production smoke tests. See [`docs/security.md`](docs/security.md),
[`docs/deployment.md`](docs/deployment.md), and
[`docs/release-checklist.md`](docs/release-checklist.md).

## Ingestion workers

Run the three private Railway services from the repository root:

```bash
pnpm worker:prematch
pnpm worker:live
pnpm worker:odds
```

Append `--once` to any pnpm command for a controlled single-cycle smoke test. The prematch
worker is a safe no-op until `PREMATCH_LEAGUE_IDS` is set. Live and odds workers make no provider
calls when PostgreSQL has no active/near-kickoff candidates. Staging and production require both
Upstash REST credentials so locks work across Railway replicas. See
[`docs/ingestion-workers.md`](docs/ingestion-workers.md) for scheduling, ownership, configuration,
markets, Railway start commands, and verification.

After ingestion, the Phase 11–15 intelligence pipeline runs as two additional private workers:

```bash
pnpm worker:probability
pnpm worker:signals
```

The first links equivalent provider entities, builds leakage-safe features, evaluates the
Poisson/Elo baseline chronologically, and persists versioned probabilities. The second applies
de-vig, edge, EV, Data Quality, Live Pressure and Smart Score before persisting a qualified signal
with structured reasons. Strategies remain disabled until explicitly enabled. See
[`docs/intelligence-engine.md`](docs/intelligence-engine.md) for formulas, score contracts,
configuration and controlled `--once` commands.

Settlement and notification delivery run as independent idempotent workers:

```bash
pnpm worker:settlement
pnpm worker:notifications
```

See [`docs/product-phases-16-25.md`](docs/product-phases-16-25.md) for the product screens,
settlement, track record, and backtesting contract, and [`docs/push-notifications.md`](docs/push-notifications.md)
for Firebase/PWA configuration.

## Development workflow

Use `feature/*` and `fix/*` branches into `develop`. Staging validates `develop`; production is cut
from `main`. Require the three repository CI checks and review on both branches. Cloud projects and
credentials are deliberately not created by this repository; follow the staging runbook before a
production release.

## Troubleshooting

- If `pnpm` is unavailable, enable Corepack and install the project-declared pnpm version.
- If Python imports fail, activate `backend/.venv` and run commands from `backend/`.
- If port 3000 or 8000 is occupied, stop the existing process or pass an alternate local port.
- If an Auth page reports missing configuration, verify `.env.local` contains both public Supabase
  values and restart `pnpm dev`.
- If email links return to the wrong host, review Supabase Authentication → URL Configuration.
- External-service errors for later phases are expected until the related service is configured;
  check `STATUS.md`.

## Responsible use

Probabilities are estimates. Historical performance never guarantees future results. Betting
involves risk and users can lose money. SmartBetBot is informational only, must be used only where
legal, and is intended for adults.
