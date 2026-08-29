#!/usr/bin/env bash
set -euo pipefail

SBB_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBB_PYTHON="$SBB_PROJECT_ROOT/backend/.venv/bin/python"
SBB_SUPABASE="$SBB_PROJECT_ROOT/node_modules/.bin/supabase"

if [[ ! -x "$SBB_PYTHON" ]]; then
  echo "Backend virtual environment missing. Follow the Python setup in README.md." >&2
  exit 1
fi

if [[ ! -x "$SBB_SUPABASE" ]]; then
  echo "Supabase CLI missing. Run pnpm install." >&2
  exit 1
fi

cd "$SBB_PROJECT_ROOT"

SBB_ENV_FILE="${SMARTBETBOT_DB_ENV_FILE:-$SBB_PROJECT_ROOT/backend/.env}"
if [[ ! -f "$SBB_ENV_FILE" ]]; then
  echo "Database environment file does not exist." >&2
  exit 1
fi
SBB_DATABASE_URL="$($SBB_PYTHON -c 'import sys; from dotenv import dotenv_values; print(dotenv_values(sys.argv[1]).get("DATABASE_URL", ""))' "$SBB_ENV_FILE" 2>/dev/null)"

if [[ -z "$SBB_DATABASE_URL" ]]; then
  echo "DATABASE_URL is missing in the selected database environment file." >&2
  exit 1
fi

"$SBB_SUPABASE" db push --db-url "$SBB_DATABASE_URL" "$@"
