# SmartBetBot API v1

FastAPI provides the versioned service boundary at `/api/v1`. It reads the versioned PostgreSQL
schema through parameterized SQLAlchemy queries and validates Supabase access tokens against the
project's asymmetric JWKS signing keys.

## Run locally in WSL

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The Railway start command remains:

```bash
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Development OpenAPI documentation is available at <http://localhost:8000/docs>, ReDoc at
<http://localhost:8000/redoc>, and the machine-readable schema at
<http://localhost:8000/openapi.json>. Interactive documentation is disabled when
`ENVIRONMENT=production`.

## Endpoint contract

Health routes are intentionally unversioned so hosting platforms can probe them without user
authentication. Every `/api/v1` route requires a valid Supabase Auth access token. Admin routes
also require `profiles.role = 'admin'`; user-editable Auth metadata is not trusted for that role.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Cheap process liveness |
| GET | `/health/ready` | Public | PostgreSQL and Upstash readiness |
| GET | `/api/v1/fixtures/live` | User | Live/halftime fixtures |
| GET | `/api/v1/fixtures/live/analysis` | User | Live fixtures, available stats, and signals |
| GET | `/api/v1/fixtures/upcoming` | User | Scheduled future fixtures |
| GET | `/api/v1/fixtures/upcoming/analysis` | User | Filtered prematch probabilities and signal data |
| GET | `/api/v1/fixtures/{fixture_id}` | User | Normalized fixture detail |
| GET | `/api/v1/signals` | User | All signals |
| GET | `/api/v1/signals/live` | User | Live signals |
| GET | `/api/v1/signals/prematch` | User | Prematch signals |
| GET | `/api/v1/signals/{signal_id}` | User | Signal, reasons, and settlement |
| GET | `/api/v1/performance` | User | Real settled aggregate only |
| GET | `/api/v1/performance/markets` | User | Aggregate by market |
| GET | `/api/v1/performance/leagues` | User | Aggregate by league |
| GET | `/api/v1/track-record` | User | Paginated settled signals |
| POST | `/api/v1/backtests/run` | User | Fixed 1-unit historical backtest |
| GET | `/api/v1/me` | User | Own profile and preferences |
| PATCH | `/api/v1/me/preferences` | User | Update allowed preference fields |
| POST | `/api/v1/push/register` | User | Idempotently register an FCM token |
| DELETE | `/api/v1/push/register` | User | Remove the caller's FCM token |
| GET | `/api/v1/admin/workers` | Admin | Worker-run telemetry |
| GET | `/api/v1/admin/api-usage` | Admin | Provider request consumption |
| GET | `/api/v1/admin/models` | Admin | Model versions and evaluation metadata |
| GET | `/api/v1/admin/strategies` | Admin | Strategy configuration |
| GET | `/api/v1/admin/overview` | Admin | DB/Redis/provider/model/signal/worker status |

List routes accept `limit` from 1 to 100 and a non-negative `offset`. The general signal list also
accepts a bounded `days` window. Responses contain `items`
and `pagination` with `limit`, `offset`, and `total`.

## Authentication

Send the current Supabase user access token—not the publishable or secret API key—as a Bearer
credential:

```bash
curl http://localhost:8000/api/v1/me \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN"
```

The API validates the signature, key ID, algorithm, issuer, audience, expiry, issued-at time,
subject UUID, and `authenticated` Auth role. JWKS is cached for at most ten minutes and refreshed
once when an unknown key ID appears, allowing signing-key rotation without putting Supabase Auth in
the hot path for every request.

The backend's `DATABASE_URL` is a privileged server connection, so API authorization is mandatory
even though browser-side RLS remains enabled. Admin status always comes from the protected profile
record.

## Errors and request tracing

Errors use one envelope and never echo request bodies, credentials, FCM tokens, SQL, or raw
database errors:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request contains invalid data.",
    "request_id": "7e869ad8-6bb5-4cc0-83c4-41dca81fc55a",
    "details": [
      {"field": "query.limit", "message": "Input should be less than or equal to 100", "type": "less_than_equal"}
    ]
  }
}
```

Every response includes `X-Request-ID`. A valid client-provided value is preserved; otherwise the
API creates one. Structured request logs include only method, path, status, duration, and request
ID.

## Readiness

`GET /health` never contacts dependencies. `GET /health/ready` concurrently executes a cheap
PostgreSQL `select 1` and an Upstash `PING`; it never calls API-Football.

Until the development Upstash database is configured, the expected result is HTTP `503`:

```json
{
  "status": "not_ready",
  "checks": {
    "database": {"status": "ok"},
    "redis": {"status": "not_configured"}
  }
}
```

Create `smartbetbot-dev` in the Upstash console and add its HTTPS REST values to the ignored
`backend/.env`:

```dotenv
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

After restarting Uvicorn, `/health/ready` must return HTTP `200` with both checks set to `ok`.

## Data semantics

Fixture and signal collections are expected to be empty until the ingestion and signal-engine
phases run. Performance endpoints aggregate only persisted, non-pending settlements. An empty
track record returns zeros and `null` rates; it never fabricates win rate, ROI, yield, or odds.
Signal and performance responses include the responsible-use notice required by the product
contract.

Current implementation references:
[Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts),
[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/),
[SQLAlchemy asyncio](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), and
[Upstash REST API](https://upstash.com/docs/redis/features/restapi).
