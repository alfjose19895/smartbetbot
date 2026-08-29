# Staging runbook

Staging is a persistent, isolated validation environment sourced from `develop`. It must not read,
write, clone, or reuse production credentials or user data.

## Provision once

Create these resources manually:

- Supabase project `smartbetbot-staging`, with Auth email flows and staging redirect URLs.
- Upstash database `smartbetbot-staging`, near the Railway region.
- Firebase project/Web App `SmartBetBot Staging`, its VAPID key, and a server service account.
- Railway `staging` environment with the eight backend services listed in
  [deployment.md](deployment.md), each using Root Directory `/backend`.
- Vercel Preview or Custom Environment scoped to branch `develop` and a stable staging URL.
- GitHub environment `staging`, restricted to `develop` for the manual deployment smoke job.

Copy the templates to a private temporary location and fill them there:

```bash
cp deploy/environments/staging.frontend.env.example /tmp/smartbetbot-staging.frontend.env
cp deploy/environments/staging.backend.env.example /tmp/smartbetbot-staging.backend.env
```

Import only the frontend file into Vercel. Import the backend values as Railway staging shared
variables and reference them from each backend service. Seal private Railway values when that
feature is available. Never add server values to Vercel with a `NEXT_PUBLIC_` prefix.

## Preflight and migrations

```bash
pnpm deploy:preflight --target staging \
  --frontend-env /tmp/smartbetbot-staging.frontend.env \
  --backend-env /tmp/smartbetbot-staging.backend.env

SMARTBETBOT_DB_ENV_FILE=/tmp/smartbetbot-staging.backend.env pnpm db:push:dry
SMARTBETBOT_DB_ENV_FILE=/tmp/smartbetbot-staging.backend.env pnpm db:push
SMARTBETBOT_DB_ENV_FILE=/tmp/smartbetbot-staging.backend.env pnpm db:lint
SMARTBETBOT_DB_ENV_FILE=/tmp/smartbetbot-staging.backend.env pnpm db:verify
```

Delete the temporary files after the values are loaded and verified. Keep secrets in cloud secret
stores, not shell history, tickets, screenshots, or logs.

## Staging acceptance

Run the read-only automated smoke:

```bash
pnpm deploy:smoke --target staging \
  --frontend-url https://STAGING_FRONTEND_ORIGIN \
  --api-url https://STAGING_API_ORIGIN
```

Then validate manually with a dedicated staging inbox/device:

- signup, confirmation, login, logout, recovery, and authenticated route redirects;
- API and Redis/PostgreSQL readiness;
- one bounded prematch cycle stores current fixtures and teams;
- probability creates idempotent predictions;
- live/odds cycles make zero calls when idle and ingest when a target exists;
- a deliberately enabled staging strategy creates a qualified test signal only from real staging
  data, then settlement records the result without hiding a loss;
- push register, refresh, quiet hours, delivery, open action, and unsubscribe;
- admin access succeeds only for a database-managed staging admin role;
- frontend mobile/desktop accessibility and PWA installation.

Record the commit SHA, migration versions, smoke output, test account/device, worker run IDs, and
known limitations. Disable the staging strategy after the controlled validation if market data is
not continuously available. Staging acceptance is mandatory before merging to `main`.
