import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/features/api/server";
import type {
  LiveFixture,
  Page,
  PerformanceResponse,
  PrematchFixture,
  SignalPage,
  TrackRecordResponse,
} from "@/features/api/types";
import { EmptyState, FixtureIdentity, MetricCard, SignalCard } from "@/features/product/components";
import { odds, percent, units } from "@/features/product/format";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/dashboard");

  const [live, signals, upcoming, performance, recent] = await Promise.all([
    apiFetch<Page<LiveFixture>>("/fixtures/live/analysis?limit=4"),
    apiFetch<SignalPage>("/signals?limit=4&days=1"),
    apiFetch<Page<PrematchFixture>>("/fixtures/upcoming/analysis?limit=4"),
    apiFetch<PerformanceResponse>("/performance?days=30"),
    apiFetch<TrackRecordResponse>("/track-record?period=30d&limit=4"),
  ]);
  const metrics = performance.data?.metrics;
  const firstName = identity.fullName?.split(" ")[0] || "analista";

  return (
    <AppShell identity={identity} currentPath="/dashboard">
      <header className="app-page-header product-heading">
        <div><span className="auth-kicker">Centro de inteligencia</span><h1>Hola, {firstName}.</h1><p>Datos, señales y rendimiento verificable en un solo lugar.</p></div>
        <div className="account-status"><i /> Datos reales</div>
      </header>

      <section className="product-metric-grid" aria-label="Resumen de rendimiento">
        <MetricCard label="Partidos en vivo" value={`${live.data?.pagination.total ?? 0}`} note="Actualización del worker live" />
        <MetricCard label="Señales hoy" value={`${signals.data?.pagination.total ?? 0}`} note="Sólo señales calificadas" />
        <MetricCard label="Win rate 30d" value={percent(metrics?.win_rate ?? null)} note={`${metrics?.resolved_signals ?? 0} resueltas`} />
        <MetricCard label="ROI 30d" value={percent(metrics?.roi ?? null)} note="Stake estadístico fijo" />
        <MetricCard label="Cuota promedio" value={odds(metrics?.average_odds ?? null)} note="Señales liquidadas" />
        <MetricCard label="Unidades netas" value={units(metrics?.profit_loss_units ?? null)} note="Pérdidas incluidas" />
      </section>

      <div className="product-dashboard-grid">
        <section className="product-panel">
          <div className="product-panel-heading"><div><span>Ahora</span><h2>Live Now</h2></div><Link href="/live">Ver pantalla live →</Link></div>
          {live.data?.items.length ? live.data.items.map((fixture) => (
            <article className="compact-fixture" key={fixture.id}><FixtureIdentity fixture={fixture} /><strong>{fixture.home_score ?? 0} — {fixture.away_score ?? 0}</strong><span>{fixture.status === "halftime" ? "HT" : `${fixture.match_minute ?? "—"}'`}</span></article>
          )) : <EmptyState title="No hay partidos en vivo" detail="El worker no llama al proveedor mientras no existan fixtures activos." />}
        </section>

        <section className="product-panel">
          <div className="product-panel-heading"><div><span>Calificadas</span><h2>Best Signals</h2></div><Link href="/prematch">Explorar →</Link></div>
          {signals.data?.items.length ? <div className="signal-card-grid">{signals.data.items.map((signal) => <SignalCard signal={signal} key={signal.id} />)}</div> : <EmptyState title="Sin señales calificadas" detail="No se muestran picks hasta superar probabilidad, edge, calidad y Smart Score." />}
        </section>
      </div>

      <section className="product-panel">
        <div className="product-panel-heading"><div><span>Próximos 14 días</span><h2>Upcoming</h2></div><Link href="/prematch">Ver análisis prematch →</Link></div>
        <div className="upcoming-strip">{upcoming.data?.items.length ? upcoming.data.items.map((fixture) => <article key={fixture.id}><FixtureIdentity fixture={fixture} /><small>{fixture.predictions.length} probabilidades</small></article>) : <EmptyState title="Sin próximos partidos" detail="Ejecuta el worker prematch para sincronizar el calendario actual." />}</div>
      </section>

      <section className="product-panel">
        <div className="product-panel-heading"><div><span>Settlement</span><h2>Recent Results</h2></div><Link href="/track-record">Historial completo →</Link></div>
        {recent.data?.items.length ? <div className="results-list">{recent.data.items.map((item) => <article key={item.signal_id}><div><strong>{item.home_team} vs {item.away_team}</strong><small>{item.market} · {item.strategy_name}</small></div><span className={`result-badge ${item.result_status}`}>{item.result_status}</span><b>{units(item.profit_loss_units)}</b></article>)}</div> : <EmptyState title="Aún no hay resultados" detail="El historial aparecerá después del settlement de señales reales." />}
      </section>
    </AppShell>
  );
}
