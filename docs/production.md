# Production runbook

Production is sourced only from `main` after staging acceptance. Provision independent resources
named `smartbetbot-production` / `SmartBetBot Production`; never duplicate staging with its sealed
credentials or connect production code to a staging database.

## Pre-production gate

Create private production env files from the templates and compare both environments:

```bash
pnpm deploy:preflight --target production \
  --frontend-env /tmp/smartbetbot-production.frontend.env \
  --backend-env /tmp/smartbetbot-production.backend.env \
  --compare-frontend-env /tmp/smartbetbot-staging.frontend.env \
  --compare-backend-env /tmp/smartbetbot-staging.backend.env
```

The preflight rejects missing required values, non-HTTPS cloud origins, demo mode, unsupported or
uncredentialed sports providers, mismatched frontend/backend Supabase or Firebase projects, and
shared resource identities.

Before any migration:

1. confirm `main` points to the staging-approved SHA and CI is green;
2. confirm no unresolved high-severity security or data-integrity issue;
3. verify Supabase's current backup/restore coverage and take a logical export when required;
4. record a rollback owner, change window, and communication channel;
5. keep all strategies disabled until production odds quality is proven.

Apply and verify migrations with `SMARTBETBOT_DB_ENV_FILE` exactly as described in the staging
runbook. Deploy API, workers, then frontend using the sequence in [deployment.md](deployment.md).
Vercel Production variables belong only to `main`; Railway production shared variables and sealed
secrets belong only to the production environment.

## Go-live validation

Run the GitHub `Deployment smoke` workflow with environment `production`, or:

```bash
pnpm deploy:smoke --target production \
  --frontend-url https://PRODUCTION_FRONTEND_ORIGIN \
  --api-url https://PRODUCTION_API_ORIGIN
```

Production smoke also requires HSTS and confirms FastAPI docs/OpenAPI are not public. Complete the
manual checklist in [release-checklist.md](release-checklist.md). Monitor readiness, HTTP error
rate, provider latency/quota, worker recency/errors, queue age, signals, notification failures, and
database connections throughout the change window.

## Rollback

- Frontend: restore the previous Vercel deployment or revert the commit. Re-run smoke.
- API/workers: restore the exact previous Railway deployment only if it is compatible with the
  migrated schema. Stop signal/notification workers first if correctness is uncertain.
- Database: never rewrite history or automatically run a down migration. Ship a reviewed forward
  fix. Restore a backup/PITR only for confirmed corruption or data loss under the incident runbook.
- Credentials: if exposure is suspected, disable affected services, rotate at the provider, update
  every target service, redeploy, and invalidate old tokens.

See [incident response](runbooks/incident-response.md) and
[backup/restore](runbooks/backup-restore.md). Domains such as `smartbetbot.com`,
`app.smartbetbot.com`, and `api.smartbetbot.com` are placeholders only; do not buy or configure
them without an explicit business decision.
