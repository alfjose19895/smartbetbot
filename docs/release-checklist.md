# Release readiness — phase 30

The master roadmap ends at phase 29. Phase 30 is defined locally as a final, non-destructive release
gate; it does not add a betting feature or imply that production has been approved.

## Automated gate

```bash
pnpm release:check
```

This runs frontend lint/types/tests/build, backend Ruff/tests/dependency consistency, static
migration checks, tracked-env/placeholder checks, and the repository deployment contract. To add
read-only checks against the database configured in `backend/.env`:

```bash
REMOTE_DATABASE_CHECKS=true pnpm release:check
```

For staging or production, select a private env file explicitly with
`SMARTBETBOT_DB_ENV_FILE`; never overwrite the development file merely to run a release.

## Go/no-go evidence

- [ ] Exact commit passed GitHub CI.
- [ ] Staging passed automated and manual acceptance on that commit.
- [ ] Frontend/backend preflight passed and environment isolation passed.
- [ ] Migration dry-run reviewed; backup/restore point recorded.
- [ ] RLS, grants, Auth redirect allowlist, and admin denial verified.
- [ ] Health/readiness green and security headers present.
- [ ] Prematch/live/odds workers produced expected real records and stayed idle with zero targets.
- [ ] Probability outputs are current and leakage-safe.
- [ ] At least one controlled strategy was validated against compatible real odds in staging.
- [ ] Signal creation, deduplication, reasons, settlement, losses, track record, and backtest agree.
- [ ] FCM register/deliver/open/quiet-hours/unsubscribe passed on a staging device.
- [ ] Provider quota/cost alerts and worker/database/API alerts are configured.
- [ ] Production rollback owner, incident channel, and post-deploy observation window are assigned.

Any unchecked data-integrity, RLS, odds, signal, settlement, or push item is a no-go. Empty screens
are correct before workers produce data, but they do not constitute production validation.
