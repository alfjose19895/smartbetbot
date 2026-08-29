#!/usr/bin/env bash
set -euo pipefail

pnpm lint
pnpm typecheck
pnpm test
pnpm build

(
  cd backend
  .venv/bin/ruff check app tests scripts
  .venv/bin/ruff format --check app tests scripts
  .venv/bin/pytest
  .venv/bin/pip check
  .venv/bin/pip-audit --strict --disable-pip --no-deps -r requirements.lock
)

pnpm audit --prod --audit-level=high
python3 scripts/check_migrations.py
python3 scripts/check_secrets.py
backend/.venv/bin/python backend/scripts/deployment_preflight.py --check-repository

if [[ "${REMOTE_DATABASE_CHECKS:-false}" == "true" ]]; then
  pnpm db:push:dry
  pnpm db:lint
  pnpm db:verify
fi
