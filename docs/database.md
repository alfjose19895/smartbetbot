# SmartBetBot database

Phase 3 provisions the PostgreSQL system of record directly in Supabase Cloud. The schema is
versioned in `supabase/migrations/`; it is not maintained manually in the Dashboard.

## Schema map

| Area | Tables | Purpose |
| --- | --- | --- |
| Accounts | `profiles`, `user_preferences` | App profile, role, and per-user thresholds |
| Catalogue | `sports`, `countries`, `leagues`, `seasons`, `teams` | Provider-neutral football catalogue |
| Match data | `fixtures`, `fixture_events`, `fixture_stats_snapshots`, `fixture_lineup_snapshots`, `fixture_injury_snapshots` | Fixture state and time-series facts |
| Prematch context | `league_standings_snapshots`, `team_season_stats_snapshots`, `provider_prediction_snapshots` | Versioned provider context; provider predictions are supplementary only |
| Markets | `odds_snapshots` | Immutable, fingerprinted price history by bookmaker and selection |
| Models | `model_versions`, `predictions` | Reproducible model metadata and estimates |
| Signals | `strategies`, `signals`, `signal_reasons`, `signal_results` | Qualification, explanation, deduplication, and settlement |
| Delivery | `push_subscriptions`, `notifications` | User devices and notification delivery records |
| Operations | `worker_runs`, `api_usage`, `audit_logs` | Worker health, provider consumption, and audit trail |

Historical sports, odds, prediction, signal, and settlement records use restrictive foreign-key
deletion rules where losing the record would compromise a track record. User-owned account data is
removed when its Supabase Auth user is deleted.

The `on_auth_user_created` trigger creates a profile and default preferences after a new
`auth.users` record is inserted. The migration also backfills users created before Phase 3. Four
initial strategies are seeded in a disabled state; they are configuration baselines, not evidence
of historical performance.

## Browser access and RLS

RLS is enabled on all 31 public tables. Grants and policies are intentionally separate and both are
restricted:

| Role | Direct browser access |
| --- | --- |
| `anon` | None of the Phase 3 tables |
| `authenticated` | Own `profiles`, `user_preferences`, and `push_subscriptions` rows only |
| `service_role` | Server and worker access; the key must never enter the browser |

Profile updates are column-limited, so a user cannot change the server-managed `role`, timestamps,
or user ID. Internal tables such as predictions, signals, notifications, worker runs, API usage,
and audit logs have no authenticated-client grants. Later product phases must introduce any new
client read policy through another reviewed migration.

## Development setup

In the Supabase Dashboard, open the development project and select **Connect**. Copy either the
direct PostgreSQL URI (when the machine has IPv6) or the session-pooler URI on port 5432. The
session pooler is suitable for migration tooling on networks that only support IPv4. Do not use the
transaction-pooler URI on port 6543 for migrations.

Put the URI only in the ignored `backend/.env`:

```dotenv
DATABASE_URL=postgresql://...
```

If the database password contains reserved URL characters, use the percent-encoded URI supplied by
the Dashboard. Never source this file as a shell script or commit it.

Install dependencies and inspect the migration plan before applying it:

```bash
pnpm install
cd backend && .venv/bin/pip install -r requirements.txt && cd ..
pnpm db:push:dry
pnpm db:push
pnpm db:lint
pnpm db:verify
```

`db:push` uses the repository-local Supabase CLI and reads `DATABASE_URL` without printing it.
Supabase records applied versions in `supabase_migrations.schema_migrations`. `db:lint` runs the
Supabase PostgreSQL linter, while `db:verify` independently audits table presence, RLS enablement,
grants, policies, seeds, Auth synchronization, and runtime cross-user isolation.

## Staging and production

Use a separate `DATABASE_URL` and Supabase project for each environment. Never apply a development
connection string to staging or production.

1. Back up the target project and confirm the target host/project reference.
2. Check out the exact release revision and install its locked Node dependencies.
3. Place the target connection URI in the runner's secret store or temporary ignored
   `backend/.env`.
4. Run `pnpm db:push:dry` and review every pending migration.
5. Apply with `pnpm db:push` during the approved change window.
6. Run `pnpm db:lint`, `pnpm db:verify`, and the application smoke tests.
7. Remove any temporary local secret material.

Never edit a migration already applied to any shared environment. Correct it with a new incremental
migration. Destructive rollbacks require a reviewed forward migration and a verified backup; there
is deliberately no automatic down command.

Official references: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[database migrations](https://supabase.com/docs/guides/deployment/database-migrations), and
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
