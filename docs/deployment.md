# SmartBetBot deployment

This is the source-of-truth deployment sequence for the monorepo. Vercel owns the root Next.js
application. Railway services use `/backend` as their Root Directory so Railpack detects Python and
installs `requirements.lock`. Supabase, Upstash, Firebase, Vercel, and Railway resources must be
different in development, staging, and production.

## Branch and environment flow

```text
feature/* or fix/* -> pull request -> develop -> staging validation -> main -> production
```

Protect `develop` and `main` in GitHub. Require the `Frontend quality`, `Backend quality`, and
`Repository and migration contract` checks. Create GitHub environments named `staging` and
`production`; restrict production to `main` and require a reviewer when the repository plan
supports it. Vercel uses Preview variables scoped to `develop` for staging and Production variables
for `main`. Railway uses persistent environments with environment-scoped shared variables.

## Services

| Platform | Service | Public | Start command |
| --- | --- | --- | --- |
| Vercel | `smartbetbot-web` | Yes | Managed Next.js build/start |
| Railway | `smartbetbot-api` | Yes | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header` |
| Railway | `smartbetbot-workers` | No | `python -m app.workers.combined` |

The private worker service supervises the prematch, live, odds, probability, signals, settlement,
and notification loops in one container. Use one replica initially. Each loop retains its own
PostgreSQL records and Upstash owner-safe lock. Only the API receives a Railway public domain.
Configure its healthcheck as `/health/ready` and allow enough drain time for graceful shutdown.
`ALLOWED_HOSTS` must include the API origin hostname plus any Railway-generated public/private
hostname used by health probes; a scoped pattern such as `*.up.railway.app` is supported.

## Controlled deployment sequence

1. CI must be green on the exact commit.
2. Complete the target environment template outside Git and run the deployment preflight.
3. Verify a fresh database backup or logical export and record its timestamp.
4. Run the database dry-run against the target and review every migration.
5. Apply migrations once, then run database lint and verification.
6. Deploy the API and verify `/health` and `/health/ready`.
7. Deploy `smartbetbot-workers` with strategies initially disabled, verify that all seven loops
   report startup, then enable the intended strategies.
8. Deploy the frontend only after the API origin is ready.
9. Run `deployment-smoke.yml` or the local read-only smoke command.
10. Complete the manual signup/login, ingestion, odds, signal, settlement, and push checklist.

Never run migrations independently from every Railway replica. Never edit an applied migration.
Rollback application code only while the schema remains backward-compatible; database corrections
are forward migrations.

Environment-specific procedures: [staging](staging.md), [production](production.md),
[security](security.md), and [release checklist](release-checklist.md).

Official references: [Vercel Git deployments](https://vercel.com/docs/git),
[Vercel environment variables](https://vercel.com/docs/environment-variables),
[Railway monorepos](https://docs.railway.com/deployments/monorepo), and
[Railway variables](https://docs.railway.com/variables).
