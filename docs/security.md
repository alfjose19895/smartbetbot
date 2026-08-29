# Security baseline

## Implemented controls

- Supabase access tokens are verified with asymmetric JWKS, issuer, audience, algorithm, expiry,
  issued-at, subject UUID, and authenticated-role checks. Admin role comes from PostgreSQL.
- RLS is enabled on all public tables. Browser grants are limited to each user's profile,
  preferences, and push subscriptions; internal analytics remain server-only.
- FastAPI trusts explicit hosts, applies explicit credentialed CORS origins, rejects oversized
  declared bodies, returns uniform errors, disables API docs/OpenAPI in production, and adds
  no-store/security headers plus HSTS in both HTTPS cloud environments.
- Authenticated API calls use an Upstash distributed fixed-window limit per user. Redis failure is
  fail-open only in development and fail-closed in staging/production.
- Next.js protects every product route including backtesting, verifies/refreshes Supabase claims,
  rejects external redirects, removes its powered-by header, and emits CSP, anti-frame,
  permissions, referrer, MIME, and production HSTS headers.
- Provider, database, Firebase, and Upstash credentials use server-only settings/headers and are
  excluded from structured logs. CI checks that runtime env files are not tracked and that secret
  placeholders remain empty.
- Worker locks use random owner tokens and compare-before-delete. Database fingerprints and unique
  constraints remain the idempotency boundary.

The Next.js CSP permits inline styles/scripts required by the current framework output, but does
not permit `unsafe-eval`; framing, objects, foreign form actions, and unknown connection origins
remain blocked. Railway/Vercel ingress must also enforce request-size and abuse controls for
chunked requests, which do not carry a trustworthy `Content-Length`.

## Secret handling

Keep runtime values only in ignored local files or provider secret stores. Use separate credentials
for each environment. Treat database URLs, Supabase secret/service keys, sports-provider keys,
Upstash tokens, Firebase private keys, FCM registration tokens, and user access tokens as secrets.
Public Supabase publishable, Firebase Web, and VAPID values may be browser-visible but still belong
to only one environment.

Rotate immediately after suspected exposure. Revoke the old value first when doing so does not
cause data loss; otherwise overlap old/new only for the shortest controlled window. Search logs and
Git history, redeploy all consumers, verify readiness, and document impact without copying the
secret into the incident record.

## Operational requirements

- Protect `develop` and `main`; require CI and review. Never use `pull_request_target` to execute
  untrusted code with secrets.
- Restrict GitHub `GITHUB_TOKEN` to read-only in CI and place deployment checks behind GitHub
  environments.
- Keep Supabase Auth redirect allowlists exact, email rate limits enabled, leaked-password checks
  enabled when available, and MFA mandatory for cloud administrators.
- Enable provider account MFA, least privilege, audit logs, backup retention, and cost/quota alerts.
- Review dependency PRs; never auto-merge major upgrades or deploy a lockfile change without CI.
- CI and the release gate run `pnpm audit` for production dependencies and PyPA `pip-audit`
  against the fully pinned Python runtime lock.
- Run `python3 scripts/check_secrets.py`, `python3 scripts/check_migrations.py`, and the full release
  gate before a release.

The Python lock currently pins exact versions but does not include artifact hashes. Adding a
reviewed hash-generating lock workflow is a future supply-chain hardening item; dependency audits
and isolated CI installation remain mandatory in the meantime.

Known release blockers and residual risks are tracked in [STATUS.md](../STATUS.md), not hidden by
the checklist.
