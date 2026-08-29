# Authentication

SmartBetBot uses Supabase Auth with email and password. Next.js owns the browser session through
secure SSR cookies; the FastAPI authorization boundary will consume verified user JWTs when its
authenticated endpoints are introduced in Phase 4.

## Components

```text
Browser
  |
  v
Next.js form -> Server Action -> Supabase Auth
  |                                |
  |                                +-> confirmation / recovery email
  v
SSR session cookie <- /auth/confirm exchanges PKCE code
  |
  v
proxy.ts -> getClaims() -> public route or protected route
```

- `lib/supabase/client.ts` creates the browser client for future realtime/client workflows.
- `lib/supabase/server.ts` creates a request-scoped server client backed by Next.js cookies.
- `lib/supabase/proxy.ts` refreshes tokens and protects authenticated route prefixes.
- `features/auth/actions.ts` implements login, registration, logout, email recovery, password
  update, and confirmation resend as Server Actions.
- `app/auth/confirm/route.ts` accepts both PKCE authorization codes and hashed OTP callbacks.
- `features/auth/lib/redirects.ts` rejects external callback destinations to prevent open redirects.

Server authorization uses `supabase.auth.getClaims()`, not the unverified user embedded in
`getSession()`. Authenticated routes are dynamically rendered and session refresh responses retain
Supabase's private/no-store cache headers.

## Local configuration

Copy the public template and set the development project values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

In Supabase Dashboard, open **Authentication → URL Configuration** and set:

```text
Site URL: http://localhost:3000
Redirect URL: http://localhost:3000/**
```

Enable email/password and require email confirmation. The development project currently responds
successfully through the public Auth settings endpoint with signup enabled, email enabled, and
automatic confirmation disabled.

The backend secret is not used by the Next.js authentication flows. When a later server component
needs administrative Supabase access, use a current `sb_secret_...` key only in `backend/.env`:

```env
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Secret and legacy service-role keys bypass RLS. They must never use a `NEXT_PUBLIC_` prefix, appear
in frontend code, or be committed.

## User flows

### Registration and confirmation

1. `/register` validates name, email, password length, and password confirmation.
2. The Server Action calls `signUp` and provides `/auth/confirm?next=/dashboard` as the redirect.
3. The response always asks the user to check their inbox; it does not disclose account existence.
4. The callback exchanges the code, writes the cookie, and continues to `/dashboard`.

### Login and logout

1. `/login` validates input and calls `signInWithPassword`.
2. Only internal `next` paths are accepted.
3. The proxy verifies the JWT claims before allowing protected routes.
4. Logout invalidates the local session, refreshes the layout, and redirects to login.

### Password recovery

1. `/forgot-password` always returns the same success message whether an account exists or not.
2. The email returns through `/auth/confirm?next=/reset-password` to establish a recovery session.
3. `/reset-password` requires verified claims before showing the update form.
4. A successful password update signs out globally and requires a fresh login.

### Resend confirmation

`/verify-email` accepts an email and calls the signup resend flow. Its response also avoids revealing
whether a pending account exists. Provider rate-limit errors remain visible so the user knows when
to wait.

## Protected routes

The proxy currently protects:

```text
/dashboard
/live
/prematch
/signals
/history
/track-record
/settings
/admin
```

Anonymous requests redirect to `/login?next=<internal-path>`. Authenticated users visiting `/login`
or `/register` redirect to `/dashboard`. Page components re-check claims as defense in depth.

Roles are intentionally deferred to Phase 3, where `profiles`, the new-user trigger, and RLS
policies become versioned database objects. User-controlled metadata will not be trusted for admin
authorization.

## Verification

Automated tests cover form schemas, error redaction, environment handling, callback URL creation,
and open-redirect protection:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Manual end-to-end checks require access to a real inbox:

1. Register with a test address.
2. Confirm through the received link.
3. Confirm `/dashboard` loads and survives a refresh.
4. Log out and verify the private route redirects.
5. Request recovery, change the password, and verify the old password is rejected.
6. Verify recovery and confirmation emails do not redirect outside the configured application URL.
