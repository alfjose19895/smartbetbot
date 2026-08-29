import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { apiFetch } from "@/features/api/server";
import type { AdminOverview, Me } from "@/features/api/types";
import { EmptyState, MetricCard } from "@/features/product/components";
import { dateTime } from "@/features/product/format";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/admin");
  const me = await apiFetch<Me>("/me");
  if (me.data?.role !== "admin") redirect("/dashboard");
  const response = await apiFetch<AdminOverview>("/admin/overview");
  const overview = response.data;

  return <AppShell identity={identity} currentPath="/admin">
    <header className="app-page-header product-heading"><div><span className="auth-kicker">Acceso restringido</span><h1>Operations Admin</h1><p>Salud, workers, proveedor, modelos y señales sin exponer secretos.</p></div></header>
    {!overview ? <section className="product-panel"><EmptyState title="Overview no disponible" detail="La API rechazó el acceso o una dependencia operativa no respondió." /></section> : <>
      <section className="product-metric-grid"><MetricCard label="Database" value={overview.database_status.toUpperCase()} note={`${overview.database_latency_ms ?? "—"} ms`} /><MetricCard label="Redis" value={overview.redis_status.toUpperCase()} note={`${overview.redis_latency_ms ?? "—"} ms`} /><MetricCard label="API Usage 24h" value={`${overview.api_requests_24h}`} note={`${overview.provider_errors_24h} errores`} /><MetricCard label="Provider latency" value={`${overview.provider_average_latency_ms_24h?.toFixed(0) ?? "—"} ms`} note="Promedio 24 horas" /><MetricCard label="Signals 24h" value={`${overview.signals_24h}`} note="Persistidas" /><MetricCard label="Strategies" value={`${overview.active_strategies}`} note="Activas actualmente" /></section>
      <section className="product-panel"><div className="product-panel-heading"><div><span>Modelo actual</span><h2>{overview.current_model || "Sin modelo activo"}</h2></div></div></section>
      <section className="product-panel"><div className="product-panel-heading"><div><span>Última ejecución por servicio</span><h2>Workers</h2></div></div><div className="worker-grid">{overview.workers.map((worker) => <article key={worker.id}><div><strong>{worker.worker}</strong><span className={`worker-status ${worker.status}`}>{worker.status}</span></div><p>{dateTime(worker.started_at)}</p><dl><div><dt>Fixtures</dt><dd>{worker.fixtures_processed}</dd></div><div><dt>Signals</dt><dd>{worker.signals_generated}</dd></div><div><dt>Errors</dt><dd>{worker.errors}</dd></div><div><dt>Duration</dt><dd>{worker.duration_ms ?? "—"} ms</dd></div></dl></article>)}</div></section>
    </>}
  </AppShell>;
}
