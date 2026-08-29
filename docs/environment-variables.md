# Environment Variables Reference

This document classifies all environment variables used by SmartBetBot across the frontend, API backend, and worker services.

---

## 1. Frontend Public Variables (Vercel & Browser)
*Exposed in client-side bundles. Only public identifiers and non-secret configuration allowed.*

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical public URL of Next.js frontend | `https://smartbetbot.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Yes | Base URL for FastAPI backend | `https://smartbetbot-api.up.railway.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | `https://xyzcompany.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase public anon key | `eyJhbGciOi...` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Optional | Firebase Web Push API Key | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Optional | Firebase Auth Domain | `smartbetbot.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Optional | Firebase Project ID | `smartbetbot-app` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional | Firebase Storage Bucket | `smartbetbot.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional | Firebase Cloud Messaging Sender ID | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Optional | Firebase Application ID | `1:123456789:web:...` |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Optional | Web Push VAPID Public Key | `BNz...` |

---

## 2. Backend Secret Variables (`smartbetbot-api`)
*Server-side only. Never exposed in client bundles or public repositories.*

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Yes | Deployment environment (`development`, `staging`, `production`) | `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection URI (port 5432 or 6543 session pooler) | `postgresql://postgres:...@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Yes | Supabase Project REST URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes | Supabase Service Role secret key | `sb_secret_...` |
| `SUPABASE_JWT_AUDIENCE` | Yes | Expected JWT audience claim | `authenticated` |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL for caching & rate limiting | `https://eu1-prompt-whale-12345.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST bearer token | `AZs...` |
| `CORS_ORIGINS` | Yes | Comma-separated list of allowed frontend origins | `https://smartbetbot.vercel.app` |
| `ALLOWED_HOSTS` | Yes | Comma-separated list of allowed API hostnames | `smartbetbot-api.up.railway.app` |
| `LOG_LEVEL` | No | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) | `INFO` |

---

## 3. Worker Secret Variables (`realtime-worker` & `jobs-worker`)
*Worker background processes only.*

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Yes | Environment name | `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection URI | `postgresql://...` |
| `SUPABASE_URL` | Yes | Supabase URL | `https://...` |
| `SUPABASE_SECRET_KEY` | Yes | Supabase Service Role key | `sb_secret_...` |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis URL for distributed locks & deduplication | `https://...` |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis Token | `AZs...` |
| `SPORTS_DATA_PROVIDER` | Yes | Active provider adapter (`api_football` or `football_data`) | `api_football` |
| `API_FOOTBALL_KEY` | Conditional | API-Football API Key | `sec_api_key_...` |
| `FOOTBALL_DATA_API_KEY` | Conditional | Football-Data.org API Key (if using football_data) | `fd_key_...` |
| `PREMATCH_LEAGUE_IDS` | Yes | Comma-separated provider league IDs to monitor | `39,140` |
| `PREMATCH_SYNC_INTERVAL_SECONDS` | No | Prematch catalog polling interval (default 21600 = 6h) | `21600` |
| `LIVE_FIXTURE_POLL_SECONDS` | No | Live fixture polling interval (default 15s) | `15` |
| `LIVE_ODDS_POLL_SECONDS` | No | Live odds polling interval (default 15s) | `15` |
| `SIGNAL_WORKER_INTERVAL_SECONDS`| No | Signal evaluation interval (default 15s) | `15` |
| `SETTLEMENT_WORKER_INTERVAL_SECONDS`| No | Match result settlement interval (default 60s) | `60` |
| `FIREBASE_PROJECT_ID` | Optional | Firebase Project ID for push notifications | `smartbetbot-app` |
| `FIREBASE_CLIENT_EMAIL` | Optional | Firebase Service Account Client Email | `firebase-adminsdk@...` |
| `FIREBASE_PRIVATE_KEY` | Optional | Firebase Service Account Private Key | `-----BEGIN PRIVATE KEY-----\n...` |

---

## 4. Shared Configuration Values

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `SIGNAL_MIN_PROBABILITY` | `0.75` | Minimum model probability threshold for signal creation |
| `SIGNAL_MIN_EDGE` | `0.05` | Minimum Smart Edge (+5%) required for signal creation |
| `SIGNAL_MIN_DATA_QUALITY` | `0.70` | Minimum Data Quality Score (70%) required |
| `SIGNAL_COOLDOWN_SECONDS` | `300` | Cooldown window (5 minutes) to prevent duplicate signals |
