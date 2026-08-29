# Ingestion workers (Phases 7–10)

SmartBetBot ships three private Python processes for Railway. They share the same normalized
provider, PostgreSQL repository, API usage recorder, and Upstash lock implementation. PostgreSQL is
the durable source of truth; Redis contains only temporary cache and lock state.

## Responsibilities and ownership

| Worker | Command | Durable responsibility |
| --- | --- | --- |
| Prematch | `python -m app.workers.prematch` | League/season catalog, teams, full current-season fixture calendar, standings, bounded team statistics, H2H, injuries/lineups when covered, supplementary provider predictions, and invocation of the shared prematch-odds service |
| Live | `python -m app.workers.live` | Live fixture status/score/minute, event timeline, cards/substitutions, and statistic snapshots |
| Odds | `python -m app.workers.odds` | Live quote normalization, implied/fair probability, movement evaluation, and append-only odds snapshots |

The odds ingestion service is the only writer of `odds_snapshots`. Provider predictions are stored
separately with `supplementary_only=true`; they are never written to SmartBetBot's own `predictions`
table.

## Required configuration

All worker secrets belong in `backend/.env` locally and Railway service variables in deployed
environments:

```dotenv
DATABASE_URL=postgresql://...
SPORTS_DATA_PROVIDER=football_data
FOOTBALL_DATA_API_KEY=...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
PREMATCH_LEAGUE_IDS=2021,2014
PREMATCH_SEASON_OVERRIDE=
PREMATCH_QUOTA_RESERVE=0
```

Use IDs belonging to the selected provider separated by commas. For `football_data`, Premier
League is `2021` and LaLiga is `2014`; for `api_football` they are `39` and `140`. An empty
`PREMATCH_LEAGUE_IDS` deliberately
makes the prematch worker a no-op instead of attempting to download the entire provider catalog.
`PREMATCH_SEASON_OVERRIDE` is an explicit development/backfill switch for a historical season; keep
it empty in normal current-season deployments. It never changes automatically after a provider
plan error.
`PREMATCH_QUOTA_RESERVE=0` is appropriate for the football-data.org minute quota when syncing two
leagues in one controlled cycle. API-Football deployments should retain a daily quota reserve.
Staging and production fail closed when Upstash is absent; development/test may use a process-local
lock with a warning.

The football-data.org free tier powers the current catalog, fixtures, delayed score/status updates,
and standings. It does not advertise events, detailed statistics, injuries, lineups, predictions,
or odds, so the shared workers skip those operations without recording false failures.

The polling defaults are fixture/events every 15 seconds, live statistics every 60 seconds, live
odds every 15 seconds, and a prematch catalog cycle every six hours. All are configurable in
`backend/.env.example`. Optional prematch enrichment is bounded to protect provider quota.

## Scheduling and idempotency

- Live discovery runs only when PostgreSQL contains an active or near-kickoff candidate. Odds runs
  only when active fixtures exist. Empty target sets produce exactly zero provider requests.
- A global live-discovery lock, a global prematch lock, and per-fixture odds/live locks use Upstash
  `SET key token NX EX ttl`; owner-checked renewal extends long cycles and compare-and-delete
  releases only the owning token.
- Fixture updates use stable provider IDs and reject stale observations. A fixture missing from the
  provider live list is reconciled explicitly and is not assumed to be finished.
- Events and snapshots have stable fingerprints. Replaying a response is safe, while a genuinely
  new observation remains part of history.
- Every cycle appends a `worker_runs` record with status, duration, fixture/record counts, provider
  request count, significant movements, and sanitized error codes.

## Odds contract

Supported MVP markets are full-match totals (over 0.5/1.5/2.5 and under where applicable), both
teams to score, match winner, double chance 1X/X2, and live next goal when match context is present.
First-half aliases and unsupported markets are ignored rather than misclassified.

Raw implied probability is `1 / decimal_odds` using `Decimal`. De-vig is calculated only for a
complete market from the same fixture/provider/bookmaker/phase/timestamp/line. Significant movement
uses configurable relative-price and implied-probability thresholds. Edge is calculated only when
a versioned internal model probability already exists; otherwise it remains absent for Phase 11.

## Local verification

From the repository root:

```bash
pnpm db:push:dry
pnpm db:lint
pnpm db:verify
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests
```

Run a single real cycle only when spending provider quota is intentional:

```bash
pnpm worker:prematch --once
pnpm worker:live --once
pnpm worker:odds --once
```

Long-running Railway start commands are the same commands without `--once`. Deploy each command as
a separate private service from the same repository and backend environment variables.
