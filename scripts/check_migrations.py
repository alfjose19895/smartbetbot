#!/usr/bin/env python3
"""Static migration checks suitable for CI without Docker or a local database."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
NAME = re.compile(r"^(?P<version>\d{12})_[a-z0-9_]+\.sql$")
DESTRUCTIVE = (
    re.compile(r"^\s*drop\s+table\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*truncate\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"alter\s+table\b[^;]*\bdrop\s+column\b", re.IGNORECASE | re.DOTALL),
)


def main() -> None:
    failures: list[str] = []
    versions: list[str] = []
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        failures.append("no migrations found")
    for path in files:
        match = NAME.fullmatch(path.name)
        if match is None:
            failures.append(f"invalid migration name: {path.name}")
            continue
        version = match.group("version")
        if version in versions:
            failures.append(f"duplicate migration version: {version}")
        versions.append(version)
        sql = path.read_text(encoding="utf-8")
        if not sql.strip():
            failures.append(f"empty migration: {path.name}")
        if any(pattern.search(sql) for pattern in DESTRUCTIVE) and (
            "destructive-migration-reviewed" not in sql.lower()
        ):
            failures.append(f"destructive migration lacks review marker: {path.name}")
    if versions != sorted(versions):
        failures.append("migration versions are not ordered")
    if failures:
        raise SystemExit("migration_contract=failed " + "; ".join(failures))
    print(f"migration_contract=ok files={len(files)}")


if __name__ == "__main__":
    main()
