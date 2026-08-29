#!/usr/bin/env python3
"""High-confidence repository secret checks without reading ignored runtime env files."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_FILES = {".env", ".env.local", "backend/.env"}
SECRET_ASSIGNMENT = re.compile(
    r"^(?P<name>[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|SERVICE_ROLE|REST_TOKEN|API_KEY|DATABASE_URL)[A-Z0-9_]*)=(?P<value>.+)$"
)
SAFE_PUBLIC = {"NEXT_PUBLIC_FIREBASE_API_KEY"}


def tracked_files() -> set[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return {value for value in result.stdout.decode().split("\0") if value}


def main() -> None:
    tracked = tracked_files()
    exposed = sorted(PRIVATE_FILES & tracked)
    failures = [f"private env file is tracked: {path}" for path in exposed]
    templates = [ROOT / ".env.example", ROOT / "backend" / ".env.example"]
    templates.extend((ROOT / "deploy" / "environments").glob("*.env.example"))
    for path in templates:
        if not path.exists():
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            match = SECRET_ASSIGNMENT.fullmatch(line.strip())
            if match and match.group("name") not in SAFE_PUBLIC and match.group("value").strip():
                failures.append(f"non-empty secret placeholder: {path.relative_to(ROOT)}:{number}")
    if failures:
        raise SystemExit("secret_contract=failed " + "; ".join(failures))
    print(f"secret_contract=ok tracked_files={len(tracked)} templates={len(templates)}")


if __name__ == "__main__":
    main()
