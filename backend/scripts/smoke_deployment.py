"""Read-only smoke checks for an already deployed staging or production environment."""

from __future__ import annotations

import argparse
from urllib.parse import urljoin, urlsplit

import httpx


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def https_origin(value: str) -> str:
    parsed = urlsplit(value)
    require(
        parsed.scheme == "https" and bool(parsed.netloc), "deployment URLs must be HTTPS origins"
    )
    require(
        parsed.path in {"", "/"} and not parsed.query and not parsed.fragment,
        "URLs must be origins",
    )
    return value.rstrip("/") + "/"


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke an existing SmartBetBot deployment.")
    parser.add_argument("--target", choices=("staging", "production"), required=True)
    parser.add_argument("--frontend-url", required=True)
    parser.add_argument("--api-url", required=True)
    args = parser.parse_args()
    frontend = https_origin(args.frontend_url)
    api = https_origin(args.api_url)
    checks = 0
    with httpx.Client(timeout=10, follow_redirects=True) as client:
        response = client.get(frontend)
        require(response.status_code == 200 and "SmartBetBot" in response.text, "frontend failed")
        require("content-security-policy" in response.headers, "frontend CSP missing")
        require("strict-transport-security" in response.headers, "frontend HSTS missing")
        checks += 3

        response = client.get(urljoin(frontend, "manifest.webmanifest"))
        require(
            response.status_code == 200 and response.json().get("name") == "SmartBetBot",
            "PWA failed",
        )
        checks += 1

        response = client.get(urljoin(api, "health"))
        payload = response.json()
        require(
            response.status_code == 200 and payload.get("environment") == args.target,
            "health failed",
        )
        require(response.headers.get("x-content-type-options") == "nosniff", "API headers missing")
        require("strict-transport-security" in response.headers, "API HSTS missing")
        checks += 3

        response = client.get(urljoin(api, "health/ready"))
        require(
            response.status_code == 200 and response.json().get("status") == "ready",
            "readiness failed",
        )
        checks += 1

        response = client.options(
            urljoin(api, "api/v1/me"),
            headers={
                "Origin": frontend.rstrip("/"),
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        require(
            response.headers.get("access-control-allow-origin") == frontend.rstrip("/"),
            "CORS failed",
        )
        checks += 1

        response = client.get(urljoin(api, "api/v1/admin/overview"))
        require(response.status_code == 401, "admin is not protected")
        response = client.post(urljoin(api, "api/v1/backtests/run"), json={})
        require(response.status_code == 401, "backtesting is not protected")
        checks += 2

        docs_status = client.get(urljoin(api, "docs")).status_code
        openapi_status = client.get(urljoin(api, "openapi.json")).status_code
        if args.target == "production":
            require(docs_status == 404 and openapi_status == 404, "production API docs are exposed")
        else:
            require(docs_status == 200 and openapi_status == 200, "staging API docs unavailable")
        checks += 2
    print(f"deployment_smoke=ok target={args.target} checks={checks}")


if __name__ == "__main__":
    main()
