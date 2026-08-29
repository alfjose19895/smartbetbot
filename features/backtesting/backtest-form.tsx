"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { browserApi } from "@/features/api/client";
import type { BacktestResponse } from "@/features/api/types";
import { MetricCard } from "@/features/product/components";
import { odds, percent, units } from "@/features/product/format";

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function BacktestForm() {
  const today = new Date();
  const prior = new Date(today);
  prior.setUTCDate(prior.getUTCDate() - 90);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = new FormData(event.currentTarget);
    const optional = (name: string) => String(values.get(name) || "").trim() || null;
    const response = await browserApi<BacktestResponse>("/backtests/run", {
      method: "POST",
      body: JSON.stringify({
        date_from: `${values.get("date_from")}T00:00:00Z`,
        date_to: `${values.get("date_to")}T23:59:59Z`,
        market: optional("market"),
        league_id: optional("league_id"),
        strategy_id: optional("strategy_id"),
        signal_type: optional("signal_type"),
        min_probability: Number(values.get("min_probability")),
        min_edge: Number(values.get("min_edge")),
        min_smart_score: Number(values.get("min_smart_score")),
        min_odds: Number(values.get("min_odds")) || null,
        max_odds: Number(values.get("max_odds")) || null,
      }),
    });
    setResult(response.data);
    setError(response.error ? "No se pudo ejecutar. Revisa los filtros e identificadores UUID." : null);
    setBusy(false);
  }

  return <>
    <form className="product-filters backtest-filters" onSubmit={run}>
      <label>Desde<input required name="date_from" type="date" defaultValue={day(prior)} /></label>
      <label>Hasta<input required name="date_to" type="date" defaultValue={day(today)} /></label>
      <label>Tipo<select name="signal_type"><option value="">Todos</option><option value="live">Live</option><option value="prematch">Prematch</option></select></label>
      <label>Mercado<input name="market" placeholder="total_goals" /></label>
      <label>Liga ID<input name="league_id" placeholder="UUID opcional" /></label>
      <label>Estrategia ID<input name="strategy_id" placeholder="UUID opcional" /></label>
      <label>Prob. mínima<input name="min_probability" type="number" min="0" max="1" step="0.01" defaultValue="0" /></label>
      <label>Edge mínimo<input name="min_edge" type="number" min="-1" max="1" step="0.01" defaultValue="-1" /></label>
      <label>Smart mínimo<input name="min_smart_score" type="number" min="0" max="100" defaultValue="0" /></label>
      <label>Odds mínimas<input name="min_odds" type="number" min="1.01" step="0.01" /></label>
      <label>Odds máximas<input name="max_odds" type="number" min="1.01" step="0.01" /></label>
      <button disabled={busy} type="submit">{busy ? "Calculando…" : "Ejecutar backtest"}</button>
    </form>
    {error ? <p className="product-error" role="alert">{error}</p> : null}
    {result ? <>
      <section className="product-metric-grid">
        <MetricCard label="Bets" value={`${result.metrics.total_bets}`} note={`${result.metrics.won} W · ${result.metrics.lost} L · ${result.metrics.void} V`} />
        <MetricCard label="Win rate" value={percent(result.metrics.win_rate)} note={`Avg ${odds(result.metrics.average_odds)}`} />
        <MetricCard label="Net units" value={units(result.metrics.net_units)} note={`${units(result.metrics.profit_units)} / ${units(result.metrics.loss_units)}`} />
        <MetricCard label="ROI" value={percent(result.metrics.roi)} note="Stake fijo 1 u" />
        <MetricCard label="Max drawdown" value={units(result.metrics.maximum_drawdown)} note="Secuencia histórica" />
        <MetricCard label="Streaks" value={`${result.metrics.longest_winning_streak}W / ${result.metrics.longest_losing_streak}L`} note="Máximas consecutivas" />
      </section>
      <section className="product-panel"><h2>Metodología</h2><p>{result.methodology}</p><p className="responsible-notice">{result.responsible_use_notice}</p></section>
    </> : null}
  </>;
}
