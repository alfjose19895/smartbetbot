import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { apiFetch } from "@/features/api/server";
import type { PerformanceResponse, TrackRecordResponse } from "@/features/api/types";
import { EmptyState, MetricCard } from "@/features/product/components";
import { dateTime, odds, percent, units } from "@/features/product/format";

export const metadata: Metadata = { title: "Track Record" };
export const dynamic = "force-dynamic";
type SearchParams = Promise<{
  period?: string;
  type?: string;
  market?: string;
  league_id?: string;
  strategy_id?: string;
}>;

export default async function TrackRecordPage({ searchParams }: { searchParams: SearchParams }) {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/track-record");
  const query = await searchParams;
  const period = ["today", "7d", "30d", "90d", "all"].includes(query.period || "") ? query.period : "30d";
  const params = new URLSearchParams({ period: period || "30d", limit: "100" });
  if (query.type) params.set("signal_type", query.type);
  if (query.market) params.set("market", query.market);
  if (query.league_id) params.set("league_id", query.league_id);
  if (query.strategy_id) params.set("strategy_id", query.strategy_id);
  const performanceParams = new URLSearchParams({ period: period || "30d" });
  if (query.type) performanceParams.set("signal_type", query.type);
  if (query.market) performanceParams.set("market", query.market);
  if (query.league_id) performanceParams.set("league_id", query.league_id);
  if (query.strategy_id) performanceParams.set("strategy_id", query.strategy_id);
  const [track, performance] = await Promise.all([apiFetch<TrackRecordResponse>(`/track-record?${params}`), apiFetch<PerformanceResponse>(`/performance?${performanceParams}`)]);
  const metrics = performance.data?.metrics;
  const items = track.data?.items ?? [];

  return <AppShell identity={identity} currentPath="/track-record">
    <header className="app-page-header product-heading"><div><span className="auth-kicker">Rendimiento auditable</span><h1>Track Record</h1><p>Todas las ganancias, pérdidas, push y void permanecen visibles.</p></div></header>
    <form className="product-filters"><label>Periodo<select name="period" defaultValue={period}><option value="today">Hoy</option><option value="7d">7 días</option><option value="30d">30 días</option><option value="90d">90 días</option><option value="all">Todo</option></select></label><label>Tipo<select name="type" defaultValue={query.type || ""}><option value="">Todos</option><option value="live">Live</option><option value="prematch">Prematch</option></select></label><label>Mercado<select name="market" defaultValue={query.market || ""}><option value="">Todos</option><option value="total_goals">Total goals</option><option value="both_teams_to_score">BTTS</option><option value="match_winner">1X2</option><option value="double_chance">Double chance</option></select></label><label>Liga ID<input name="league_id" placeholder="UUID opcional" defaultValue={query.league_id || ""} /></label><label>Estrategia ID<input name="strategy_id" placeholder="UUID opcional" defaultValue={query.strategy_id || ""} /></label><button type="submit">Filtrar</button></form>
    <section className="product-metric-grid"><MetricCard label="Total Signals" value={`${metrics?.settled_signals ?? 0}`} note={`${metrics?.wins ?? 0} won · ${metrics?.losses ?? 0} lost`} /><MetricCard label="Win Rate" value={percent(metrics?.win_rate ?? null)} note="Won / resolved" /><MetricCard label="Average Odds" value={odds(metrics?.average_odds ?? null)} note="Sin ocultar cuotas" /><MetricCard label="Net Units" value={units(metrics?.profit_loss_units ?? null)} note="Stake fijo 1 u" /><MetricCard label="ROI" value={percent(metrics?.roi ?? null)} note="Net / stake" /><MetricCard label="Yield" value={percent(metrics?.yield_rate ?? null)} note="Rendimiento histórico" /></section>
    <section className="product-panel">{items.length ? <div className="track-table"><div className="track-row track-head"><span>Partido</span><span>Señal</span><span>Odds</span><span>Score</span><span>Resultado</span><span>Units</span></div>{items.map((item) => <div className="track-row" key={item.signal_id}><span><strong>{item.home_team} vs {item.away_team}</strong><small>{item.league} · {dateTime(item.kickoff_at)}</small></span><span><strong>{item.selection.toUpperCase()}</strong><small>{item.market} · {item.strategy_name}</small></span><span>{odds(item.decimal_odds)}</span><span>{Math.round(item.smart_score)}</span><span><b className={`result-badge ${item.result_status}`}>{item.result_status}</b></span><span>{units(item.profit_loss_units)}</span></div>)}</div> : <EmptyState title="No hay señales liquidadas" detail="Los filtros nunca sustituyen datos reales ni eliminan resultados perdedores." />}</section>
    <p className="responsible-notice">{track.data?.responsible_use_notice}</p>
  </AppShell>;
}
