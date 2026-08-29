# Intelligence and signal workers (phases 11–15)

The intelligence pipeline is deterministic and keeps sports-data ingestion separate from betting
decisions:

```text
finished fixtures -> canonical provider links -> leakage-safe features
-> Poisson/Elo model -> versioned probabilities -> odds/de-vig/edge/EV
-> Data Quality + Live Pressure -> Smart Score -> qualified signal + reasons
```

No LLM is used to calculate probabilities, edge, EV, Data Quality, Live Pressure or Smart Score.
Signal explanations are generated from stored structured reasons by a deterministic template.

## Configuration

The default links cover the two leagues currently ingested by the project:

```dotenv
INTELLIGENCE_LEAGUE_LINKS=api_football:39,football_data:2021;api_football:140,football_data:2014
PROBABILITY_HORIZON_DAYS=14
PROBABILITY_TARGET_LIMIT=200
PROBABILITY_WORKER_INTERVAL_SECONDS=21600
SIGNAL_WORKER_INTERVAL_SECONDS=15
SIGNAL_TARGET_LIMIT=100
```

Each semicolon-separated group declares provider league IDs that represent the same competition.
League links are explicit. Teams within a linked league are joined first by a unique code shared by
providers and then by a normalized name. Every link stores its method, confidence and approval
state for auditing.

## Apply and run

```bash
pnpm db:push
pnpm db:verify
pnpm worker:probability --once
pnpm worker:signals --once
```

The Probability Engine creates/updates model version `prematch_poisson_elo:1.0.0`, evaluates it with
a chronological walk-forward test, and writes one idempotent prediction per fixture/market/
selection/line/feature cutoff. It supports match winner, totals 0.5/1.5/2.5, BTTS and double chance.

Strategies remain disabled after migration. Enable one deliberately only after its odds market is
being populated. With no enabled strategy or no matching odds, the signal worker performs a safe
no-op and records the reason in `worker_runs`.

## Score contracts

Data Quality is phase-aware. Prematch uses odds (30), historical features (45), lineups (15), and
standings (10). Live uses minute (7), score (7), events (8), statistics (8), shots (8), shots on
target (8), possession (6), corners (6), cards (6), odds (15), historical features (15), and
lineups (6). Odds and historical features are always required; live also requires minute and score.

Live Pressure uses actual cumulative-stat deltas in 5/10/15-minute windows weighted 50/30/20. If a
prior snapshot does not exist, that window is unavailable—it is never synthesized.

Smart Score combines model confidence, edge, Data Quality, calibration quality, odds stability and
market quality; live signals also include Live Pressure. Categories are: `elite >= 90`, `strong >=
80`, `qualified >= 75`, `watch >= 65`, otherwise `no_bet`. Only the first three qualify by default.

The Signal Engine applies each strategy's configurable probability, edge, Data Quality, odds and
Smart Score thresholds. Within cooldown, it emits again only for a critical event, line change, 5%
odds move, 2 percentage-point edge move, or 5-point Smart Score move (all material thresholds are
configurable).
