# Railway Deployment & Service Consolidation Plan

## 1. Overview & Service Map

To ensure stability, reduce operational complexity, eliminate uncoordinated worker processing, and control hosting costs, SmartBetBot consolidates the previous 5–7 separate microservices into **at most 3 Railway services** (or 2 services if desired).

### Service Mapping Table

| Previous Railway Service | New Railway Service | Status / Action | Entrypoint / Start Command |
| :--- | :--- | :--- | :--- |
| `web` (FastAPI) | **`smartbetbot-api`** | **Keep / Rename** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header` |
| `live` | **`smartbetbot-realtime-worker`** | **Consolidate** | `python -m app.workers.realtime` |
| `odds` | **`smartbetbot-realtime-worker`** | **Consolidate** | `python -m app.workers.realtime` |
| `probability` | **`smartbetbot-realtime-worker`** | **Convert to Internal Module** | Python library imported directly by realtime worker and API |
| `prematch` | **`smartbetbot-jobs-worker`** | **Consolidate** | `python -m app.workers.jobs` |
| `settlement` | **`smartbetbot-jobs-worker`** | **Consolidate** | `python -m app.workers.jobs` |
| `web` (Next.js) | **Vercel** | **Delete from Railway** | Frontend deployed on Vercel only |

---

## 2. The 3 Target Services Specification

### Service 1: `smartbetbot-api`
- **Role**: Public HTTP REST API, Health Checks, Auth validation, Signals API, Dashboard, Admin API.
- **Root Directory**: `backend` (or project root with `cd backend` in command)
- **Public Domain**: **YES** (Generate a Railway domain or attach custom domain)
- **Start Command**:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header
  ```
- **Environment Variables**:
  - `ENVIRONMENT`: `production` (or `staging`)
  - `DATABASE_URL`: Supabase PostgreSQL connection string (session pooler recommended)
  - `SUPABASE_URL`: `https://<your-project>.supabase.co`
  - `SUPABASE_SECRET_KEY`: Supabase service role secret key
  - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token
  - `CORS_ORIGINS`: `https://<your-vercel-app>.vercel.app`
  - `ALLOWED_HOSTS`: `<your-railway-domain>.up.railway.app`
  - `LOG_LEVEL`: `INFO`
  - `SUPABASE_JWT_AUDIENCE`: `authenticated`

### Service 2: `smartbetbot-realtime-worker`
- **Role**: Real-time live fixture polling, live odds snapshots, baseline model live probability updates, live pressure calculation, signal engine qualification, deduplication cooldown, push notification dispatch.
- **Root Directory**: `backend`
- **Public Domain**: **NO** (Private worker process)
- **Start Command**:
  ```bash
  python -m app.workers.realtime
  ```
- **Environment Variables**:
  - `ENVIRONMENT`: `production` (or `staging`)
  - `DATABASE_URL`: Supabase PostgreSQL connection string
  - `SUPABASE_URL`: Supabase URL
  - `SUPABASE_SECRET_KEY`: Supabase service role secret key
  - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token
  - `SPORTS_DATA_PROVIDER`: `api_football`
  - `API_FOOTBALL_KEY`: API-Football Secret Key
  - `PREMATCH_LEAGUE_IDS`: `39,140`
  - `LIVE_FIXTURE_POLL_SECONDS`: `15`
  - `LIVE_ODDS_POLL_SECONDS`: `15`
  - `SIGNAL_WORKER_INTERVAL_SECONDS`: `15`
  - `LOG_LEVEL`: `INFO`

### Service 3: `smartbetbot-jobs-worker`
- **Role**: Scheduled/batch prematch catalog updates, team sync, upcoming fixture sync, standings, lineups, injuries, finished match settlement, and database maintenance.
- **Root Directory**: `backend`
- **Public Domain**: **NO** (Private worker process)
- **Start Command**:
  ```bash
  python -m app.workers.jobs
  ```
- **Environment Variables**:
  - `ENVIRONMENT`: `production` (or `staging`)
  - `DATABASE_URL`: Supabase PostgreSQL connection string
  - `SUPABASE_URL`: Supabase URL
  - `SUPABASE_SECRET_KEY`: Supabase service role secret key
  - `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL
  - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token
  - `SPORTS_DATA_PROVIDER`: `api_football`
  - `API_FOOTBALL_KEY`: API-Football Secret Key
  - `PREMATCH_LEAGUE_IDS`: `39,140`
  - `PREMATCH_SYNC_INTERVAL_SECONDS`: `21600` (6 hours)
  - `SETTLEMENT_WORKER_INTERVAL_SECONDS`: `60` (1 minute)
  - `LOG_LEVEL`: `INFO`

---

## 3. Alternative: 2-Service Architecture

If Railway resource limits require running with only **2 services**:

1. **`smartbetbot-api`**:
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header`
2. **`smartbetbot-worker`**:
   `python -m app.workers.combined` (runs both realtime and jobs worker loops with task isolation and distributed Redis locks).

---

## 4. Migration & Transition Steps

1. **Deploy New Services First**: Create/configure `smartbetbot-api`, `smartbetbot-realtime-worker`, and `smartbetbot-jobs-worker`.
2. **Verify Doctor & Health**:
   - Verify `GET /health` and `GET /health/ready` return HTTP 200 on `smartbetbot-api`.
   - Run `python -m app.cli.doctor` in staging environment.
3. **Verify Vercel Integration**:
   - Update Vercel environment variable `NEXT_PUBLIC_API_URL` to point to the new `smartbetbot-api` URL.
4. **Decommission Old Services**:
   - Once the 3 consolidated services are healthy and generating live/settlement records, safely remove the old separate `probability`, `odds`, `live`, `prematch` microservice deployments from Railway.
