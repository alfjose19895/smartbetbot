import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { apiFetch } from "@/features/api/server";
import type { Page, PrematchFixture } from "@/features/api/types";
import { EmptyState, FixtureIdentity, PredictionPill } from "@/features/product/components";

export const metadata: Metadata = { title: "Prematch" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  market?: string;
  score?: string;
  date_from?: string;
  date_to?: string;
  league_id?: string;
}>;

export default async function PrematchPage({ searchParams }: { searchParams: SearchParams }) {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/prematch");
  const query = await searchParams;
  const params = new URLSearchParams({ limit: "50" });
  if (query.market) params.set("market", query.market);
  if (query.score) params.set("minimum_smart_score", query.score);
  if (query.date_from) params.set("date_from", `${query.date_from}T00:00:00Z`);
  if (query.date_to) params.set("date_to", `${query.date_to}T23:59:59Z`);
  if (query.league_id) params.set("league_id", query.league_id);
  const response = await apiFetch<Page<PrematchFixture>>(`/fixtures/upcoming/analysis?${params}`);
  const fixtures = response.data?.items ?? [];

  return (
    <AppShell identity={identity} currentPath="/prematch">
      <header className="app-page-header product-heading"><div><span className="auth-kicker">Análisis previo</span><h1>Prematch</h1><p>Probabilidades propias, odds y edge cuando el mercado esté disponible.</p></div></header>
      <form className="product-filters">
        <label>Desde<input name="date_from" type="date" defaultValue={query.date_from || ""} /></label>
        <label>Hasta<input name="date_to" type="date" defaultValue={query.date_to || ""} /></label>
        <label>Liga ID<input name="league_id" placeholder="UUID opcional" defaultValue={query.league_id || ""} /></label>
        <label>Mercado<select name="market" defaultValue={query.market || ""}><option value="">Todos</option><option value="total_goals">Total goals</option><option value="both_teams_to_score">BTTS</option><option value="match_winner">1X2</option><option value="double_chance">Double chance</option></select></label>
        <label>Smart Score<select name="score" defaultValue={query.score || ""}><option value="">Cualquiera</option><option value="75">75+</option><option value="80">80+</option><option value="90">90+</option></select></label>
        <button type="submit">Aplicar filtros</button>
      </form>
      {!fixtures.length ? <section className="product-panel"><EmptyState title="No hay análisis con estos filtros" detail="Las probabilidades aparecen después del worker probability; odds y Smart Score sólo cuando existen datos de mercado." /></section> : <div className="prematch-list">{fixtures.map((fixture) => <article className="prematch-card" key={fixture.id}><FixtureIdentity fixture={fixture} /><div className="prediction-header"><span>Mercado</span><span>Prob.</span><span>Odds</span><span>Score</span></div><div className="prediction-list">{fixture.predictions.length ? fixture.predictions.map((prediction) => <PredictionPill prediction={prediction} key={prediction.id} />) : <p className="data-unavailable">Sin predicciones para el filtro seleccionado.</p>}</div></article>)}</div>}
    </AppShell>
  );
}
