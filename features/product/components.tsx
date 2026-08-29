import Link from "next/link";

import type { Fixture, PrematchPrediction, Signal } from "@/features/api/types";
import { dateTime, marketLabel, odds, percent, score } from "@/features/product/format";

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="product-empty">
      <span aria-hidden="true">◎</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="product-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export function FixtureIdentity({ fixture }: { fixture: Fixture }) {
  return (
    <div className="fixture-identity">
      <small>{fixture.league.name}</small>
      <div>
        <strong>{fixture.home_team.name}</strong>
        <span>vs</span>
        <strong>{fixture.away_team.name}</strong>
      </div>
      <time dateTime={fixture.kickoff_at}>{dateTime(fixture.kickoff_at)}</time>
    </div>
  );
}

export function SignalCard({ signal }: { signal: Signal }) {
  return (
    <Link className="signal-product-card" href={`/signals/${signal.id}`}>
      <div className="signal-product-topline">
        <span className={`score-badge ${signal.category}`}>{score(signal.smart_score)}</span>
        <small>{signal.signal_type === "live" ? `${signal.match_minute ?? "—"}' LIVE` : "PREMATCH"}</small>
      </div>
      <h3>{signal.home_team.name} vs {signal.away_team.name}</h3>
      <p>{marketLabel(signal.market, signal.selection, signal.line)}</p>
      <dl className="signal-product-metrics">
        <div><dt>Prob.</dt><dd>{percent(signal.model_probability)}</dd></div>
        <div><dt>Edge</dt><dd>{percent(signal.edge)}</dd></div>
        <div><dt>Cuota</dt><dd>{odds(signal.decimal_odds)}</dd></div>
      </dl>
    </Link>
  );
}

export function PredictionPill({ prediction }: { prediction: PrematchPrediction }) {
  return (
    <div className="prediction-pill">
      <div>
        <strong>{marketLabel(prediction.market, prediction.selection, prediction.line)}</strong>
        <small>{prediction.strategy_name || "Probabilidad del modelo"}</small>
      </div>
      <span>{percent(prediction.probability)}</span>
      <span className="prediction-odds">{odds(prediction.decimal_odds)}</span>
      <span className="prediction-score">{score(prediction.smart_score)}</span>
    </div>
  );
}
