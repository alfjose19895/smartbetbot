# Sports data providers

Phase 5 defines the provider-neutral boundary used by ingestion workers. Phase 6 implements its
first production adapter for API-Football v3; the current-season integration also includes a
football-data.org v4 adapter.

```text
Prematch / Live / Odds workers
              |
              v
      SportsDataProvider
              |
      normalized domain models
              |
       repositories / services

API-Football payload -> validate -> map -> normalized model
```

No API-Football response model, status code, field name, pagination object, or raw JSON is allowed
past the adapter boundary. Provider identity and external IDs remain explicit so normalized records
can later be sourced from Sportmonks, Sportradar, or another adapter without changing worker or
domain code.

## Capabilities

`SportsDataProvider` is an asynchronous abstract class with these operations:

| Method | Normalized result | Capability |
| --- | --- | --- |
| `list_leagues` | League, seasons, coverage | `leagues` |
| `list_teams` | Team and venue | `teams` |
| `list_fixtures` | Scheduled/completed/historical fixture | `fixtures`, `historical_fixtures` |
| `list_live_fixtures` | Live or halftime fixture | `live_fixtures` |
| `get_fixture_events` | Goal/card/substitution/VAR timeline | `events` |
| `get_fixture_statistics` | Nullable per-team match statistics | `statistics` |
| `get_fixture_lineups` | Starting XI, substitutes, formation | `lineups` |
| `get_fixture_injuries` | Provider-reported player absences | `injuries` |
| `get_standings` | Overall or group table | `standings` |
| `get_odds` | Prematch/live decimal quote | `prematch_odds`, `live_odds` |
| `get_prediction` | Supplementary provider estimate | `predictions` |
| `get_head_to_head` | Historical meetings | `historical_fixtures` |
| `get_team_season_statistics` | Leakage-safe season aggregates | `team_season_statistics` |

Adapters declare a `frozenset` of capabilities. Callers use `require_capability()` before spending
quota. League-season `coverage` is represented separately because an advertised endpoint does not
guarantee that every competition or fixture contains events, lineups, statistics, predictions, or
odds. The [current API-Football guidance](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
also recommends checking coverage before making downstream calls.

## Domain guarantees

The normalized Pydantic models are frozen and reject unknown fields. Their core guarantees include:

- timezone-aware fixture, capture, and request timestamps;
- distinct home and away teams;
- explicit provider/external-ID pairs rather than provider-specific integer types;
- nullable statistics when a competition does not collect a metric;
- decimals greater than one for decimal odds;
- bounded, unique batches of at most 20 fixture IDs;
- valid date windows and mutually exclusive `last`/`next` fixture queries;
- provider predictions permanently marked `supplementary_only=true`.

Provider predictions must never become SmartBetBot's primary probability or Smart Score. Later
model phases calculate and version those values independently.

Every response includes safe request metadata: provider, operation, request timestamp, duration,
external request count, optional quota counters, pagination, and cache status. It never includes
credentials, authorization headers, or complete response bodies.

## Error contract

Adapters translate transport/provider failures into these safe exceptions:

- `ProviderAuthenticationError` — non-retryable bad/revoked server credentials;
- `ProviderRateLimitError` — retryable, with optional retry delay;
- `ProviderUnavailableError` — retryable timeout or upstream outage;
- `ProviderPayloadError` — non-retryable mapping/schema failure;
- `ProviderConfigurationError` — missing adapter or invalid local configuration;
- `UnsupportedCapabilityError` — rejected before an unnecessary upstream request.

The API-Football adapter never puts an API key, URL query containing credentials, authorization
header, or raw response body into an exception message, structured log, cache key, or `api_usage`
record.

## Controlled mock

`ControlledMockSportsDataProvider` exists only for unit tests and explicitly labelled development
previews. Its default dataset is empty, so it cannot manufacture fixtures, performance, or betting
results. Injected test datasets remain deterministic.

Configuration is fail-closed:

```dotenv
SPORTS_DATA_PROVIDER=mock
DEMO_MODE=true
```

Both values are required and `ENVIRONMENT=production` always rejects the mock. The normal default
remains:

```dotenv
SPORTS_DATA_PROVIDER=api_football
DEMO_MODE=false
```

The factory now builds `ApiFootballProvider` for the default selection. A missing key raises an
explicit configuration error instead of silently falling back to fake data.

## football-data.org implementation

`FootballDataProvider(SportsDataProvider)` supports the operations available to the configured free
tier: competitions and seasons, competition teams, current/historical fixture lists, delayed live
fixture discovery, and official running-season standings. Provider competition IDs remain stable
external references (`2021` for Premier League and `2014` for LaLiga).

The adapter sends `X-Auth-Token` only as a server-side header, parses the minute quota and reset
headers, caches successful payloads, records safe `api_usage` facts, and applies bounded retries.
Operations not supplied by the free plan—events, detailed statistics, injuries, lineups,
predictions, and odds—are absent from its capability set and fail before an HTTP request if called
directly. Workers inspect those capabilities and skip them cleanly.

```dotenv
SPORTS_DATA_PROVIDER=football_data
FOOTBALL_DATA_API_KEY=your_server_key
FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4
FOOTBALL_DATA_TIMEOUT_SECONDS=10
FOOTBALL_DATA_MAX_RETRIES=2
PREMATCH_LEAGUE_IDS=2021,2014
PREMATCH_SEASON_OVERRIDE=
PREMATCH_QUOTA_RESERVE=0
```

Keep `FOOTBALL_DATA_API_KEY` in ignored backend environment files or Railway secrets. Attribution
required by the provider must be included in any user-facing application that displays its data.

## API-Football implementation

`ApiFootballProvider(SportsDataProvider)` supports:

- `/leagues` and league-season coverage;
- `/teams` and venues;
- `/fixtures`, `/fixtures/headtohead`, and live fixture filters;
- `/fixtures/events`, `/fixtures/statistics`, and `/fixtures/lineups`;
- `/injuries` scoped to a known fixture when league coverage exposes it;
- `/standings`;
- `/odds` with bounded pagination and `/odds/live`;
- optional `/predictions`, always mapped as supplementary context;
- `/teams/statistics` for normalized season aggregates.

Endpoint payloads are first validated by adapter-private Pydantic models and then mapped into frozen
domain models. Missing statistics remain `None`; no missing value is invented as zero. API-Football
country subdivision codes such as `GB-ENG` are retained rather than collapsed to a different
country identity.

The adapter authenticates direct API-Sports requests with the server-only `x-apisports-key` header
and the default base URL `https://v3.football.api-sports.io`. The wrapper's `errors` value is checked
even when HTTP status is `200`, because a successful transport does not necessarily mean the query
was accepted. This follows the [official API-Football getting-started guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

## Cache and freshness

Successful normalized-source payloads use canonical SHA-256 cache keys. The Upstash adapter issues
REST `GET`/`SET ... EX` commands and never treats Redis as permanent history.

| Operation | TTL |
| --- | ---: |
| Live fixtures, events, live odds | 15 seconds |
| Fixture statistics | 60 seconds |
| Fixtures and lineups | 5 minutes |
| Injuries | 30 minutes |
| Historical fixtures, standings, predictions | 1 hour |
| Prematch odds | 3 hours |
| Team-season statistics | 12 hours |
| Leagues and teams | 24 hours |

Cache reads and writes fail open: provider data can still be fetched if Upstash has a transient
failure. When both development Upstash settings are absent, the factory uses an explicit no-op
cache so local API-Football verification is possible; `STATUS.md` keeps that missing cloud service
visible as manual configuration. Supplying only one of the two settings is rejected.

## Retries, quota, and telemetry

The shared `httpx.AsyncClient` has a ten-second default timeout. Transport failures and HTTP
`429`, `499`, `500`, `502`, `503`, and `504` are retried up to the configured bound with exponential
backoff and jitter. `Retry-After` is honored when present. Authentication and ordinary client/payload
errors are not retried.

API-Football daily and per-minute headers are parsed according to the
[official rate-limit guide](https://www.api-football.com/news/post/how-ratelimit-works). Every actual
HTTP attempt can append one `api_usage` row containing the endpoint path, response status, duration,
daily remaining quota, attempt number, minute counters, request ID, and worker name. Recording is
fail-open, and secrets or raw payloads are never included. Cache hits report
`external_requests=0` and do not create false quota consumption.

Configuration is server-only:

```dotenv
SPORTS_DATA_PROVIDER=api_football
API_FOOTBALL_KEY=your_server_key
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_TIMEOUT_SECONDS=10
API_FOOTBALL_MAX_RETRIES=2
API_FOOTBALL_BACKOFF_BASE_SECONDS=0.5
API_FOOTBALL_BACKOFF_MAX_SECONDS=8
API_FOOTBALL_BACKOFF_JITTER_SECONDS=0.25
API_FOOTBALL_MAX_PAGES=20
API_USAGE_WRITE_TIMEOUT_SECONDS=2
```

`API_FOOTBALL_KEY` belongs only in ignored backend environment files or Railway secrets. It must
never use a `NEXT_PUBLIC_` prefix.

Run a one-request read-only smoke check from the repository root:

```bash
pnpm provider:verify
```

The command reports normalization and quota metadata only. It never prints the key or a raw
response. The development smoke check passed against league `39` on 2026-08-25.

The provider coverage verified for this contract includes fixtures, live scores, events, lineups,
fixture statistics, teams, leagues, standings, prematch/live odds, and optional predictions. See
the [official API-Football coverage page](https://www.api-football.com/coverage).
