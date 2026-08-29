# Product phases 16–25

The authenticated application now consumes the FastAPI contract directly. It does not insert
demo fixtures, odds, signals, results, or performance values when a data source is empty.

## Product routes

- `/dashboard` combines live fixtures, today's qualified signals, upcoming analysis, 30-day
  performance, and recent settled results.
- `/live` renders current score, minute, available statistics, and live signals. Missing provider
  statistics remain labelled unavailable.
- `/prematch` supports date, league, market, and Smart Score filters over upcoming predictions.
- `/signals/[id]` shows stored probability, price, edge, EV, data quality, pressure, Smart Score,
  structured reasons, and settlement.
- `/track-record` keeps won, lost, void, and push results visible and filters by period, signal
  type, league, market, and strategy.
- `/backtesting` runs a historical fixed-stake 1-unit simulation. It never places a bet.
- `/settings` manages user thresholds, signal types, markets, timezone, quiet hours, and the web
  push subscription.
- `/admin` is role protected and summarizes PostgreSQL, Redis, provider usage/latency/errors,
  signals, active strategies, current model, and worker runs.
- `/responsible-gambling` documents the product's responsible-use boundaries.

All screens are responsive and expose a real empty state if the corresponding worker has not
produced data.

## Settlement and performance

Run one settlement pass with:

```bash
pnpm worker:settlement --once
```

The worker only settles completed/cancelled fixtures and applies deterministic market rules.
Retries are idempotent through the unique `signal_results.signal_id` contract. Unsupported or
cancelled markets are void; incomplete fixtures remain pending. Track record and backtesting query
the same immutable result rows, so filtering cannot erase historical losses.

## Backtesting methodology

`POST /api/v1/backtests/run` accepts date, market, league, strategy, signal type, minimum
probability/edge/Smart Score, and odds range. Metrics include win rate, average odds, positive and
negative units, net units, ROI/yield, maximum drawdown, and longest winning/losing streak. A fixed
one-unit stake avoids retroactive staking assumptions.
