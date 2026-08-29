import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/features/api/server";
import type { LiveFixture, Page } from "@/features/api/types";
import { EmptyState, FixtureIdentity } from "@/features/product/components";
import { score } from "@/features/product/format";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const metadata: Metadata = { title: "En vivo" };
export const dynamic = "force-dynamic";

function Stat({ label, home, away }: { label: string; home: number | null; away: number | null }) {
  if (home === null && away === null) return null;
  return <div className="live-stat-row"><span>{home ?? "—"}</span><small>{label}</small><span>{away ?? "—"}</span></div>;
}

export default async function LivePage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/live");
  const response = await apiFetch<Page<LiveFixture>>("/fixtures/live/analysis?limit=50");
  const fixtures = response.data?.items ?? [];

  return (
    <AppShell identity={identity} currentPath="/live">
      <header className="app-page-header product-heading"><div><span className="auth-kicker">Tiempo real</span><h1>Live Screen</h1><p>Sólo estadísticas confirmadas por el proveedor y señales calificadas.</p></div><div className="account-status"><i /> Polling 15 s</div></header>
      {!fixtures.length ? <section className="product-panel"><EmptyState title="No hay partidos activos" detail="Esta pantalla permanecerá vacía y el proveedor no recibirá llamadas innecesarias." /></section> : (
        <div className="live-fixture-grid">{fixtures.map((fixture) => {
          const home = fixture.home_statistics;
          const away = fixture.away_statistics;
          const bestSignal = fixture.current_signals[0];
          return <article className="live-fixture-card" key={fixture.id}>
            <div className="live-fixture-head"><FixtureIdentity fixture={fixture} /><div className="live-score"><strong>{fixture.home_score ?? 0} — {fixture.away_score ?? 0}</strong><span>{fixture.status === "halftime" ? "HT" : `${fixture.match_minute ?? "—"}'`}</span></div></div>
            <div className="live-score-strip"><div><span>Live Pressure</span><strong>{score(bestSignal?.live_pressure_score ?? null)}</strong></div><div><span>Smart Score</span><strong>{score(bestSignal?.smart_score ?? null)}</strong></div></div>
            {home || away ? <div className="live-stats"><Stat label="Shots" home={home?.shots ?? null} away={away?.shots ?? null} /><Stat label="On target" home={home?.shots_on_target ?? null} away={away?.shots_on_target ?? null} /><Stat label="Possession" home={home?.possession ?? null} away={away?.possession ?? null} /><Stat label="Corners" home={home?.corners ?? null} away={away?.corners ?? null} /><Stat label="Yellow cards" home={home?.yellow_cards ?? null} away={away?.yellow_cards ?? null} /><Stat label="Red cards" home={home?.red_cards ?? null} away={away?.red_cards ?? null} /></div> : <p className="data-unavailable">Estadísticas live aún no disponibles.</p>}
            <div className="fixture-signal-list">{fixture.current_signals.length ? fixture.current_signals.map((signal) => <Link href={`/signals/${signal.id}`} key={signal.id}><span>{signal.selection.toUpperCase()} {signal.line ?? ""}</span><strong>{Math.round(signal.smart_score)}</strong></Link>) : <small>Sin señal activa: los umbrales no se cumplen.</small>}</div>
          </article>;
        })}</div>
      )}
    </AppShell>
  );
}
