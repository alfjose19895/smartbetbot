import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { apiFetch } from "@/features/api/server";
import type { SignalDetailResponse } from "@/features/api/types";
import { marketLabel, odds, percent, score, units } from "@/features/product/format";

export const metadata: Metadata = { title: "Detalle de señal" };
export const dynamic = "force-dynamic";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getVerifiedIdentity();
  const { id } = await params;
  if (!identity) redirect(`/login?next=/signals/${id}`);
  const response = await apiFetch<SignalDetailResponse>(`/signals/${encodeURIComponent(id)}`);
  const signal = response.data?.signal;

  return <AppShell identity={identity} currentPath="/prematch">{!signal ? <section className="product-panel product-error"><span>404</span><h1>Señal no disponible</h1><p>Puede no existir, estar fuera de tu sesión o la API no estar disponible.</p></section> : <>
    <header className="signal-detail-hero"><div><span className="auth-kicker">{signal.signal_type === "live" ? `${signal.match_minute ?? "—"}' · LIVE` : "PREMATCH"}</span><h1>{signal.home_team.name} vs {signal.away_team.name}</h1><p>{marketLabel(signal.market, signal.selection, signal.line)}</p></div><div className={`giant-score ${signal.category}`}><span>Smart Score</span><strong>{score(signal.smart_score)}</strong><small>{signal.category}</small></div></header>
    <section className="signal-detail-metrics"><article><span>Model Probability</span><strong>{percent(signal.model_probability)}</strong></article><article><span>Market Probability</span><strong>{percent(signal.fair_market_probability ?? signal.raw_implied_probability)}</strong></article><article><span>Edge</span><strong>{percent(signal.edge)}</strong></article><article><span>Expected Value</span><strong>{percent(signal.expected_value)}</strong></article><article><span>Live Pressure</span><strong>{score(signal.live_pressure_score)}</strong></article><article><span>Odds</span><strong>{odds(signal.decimal_odds)}</strong></article></section>
    <section className="product-panel why-signal"><div className="product-panel-heading"><div><span>Evidencia estructurada</span><h2>Why this signal?</h2></div></div><div className="reason-list">{signal.reasons.map((reason) => <article key={reason.code}><div><strong>{reason.label}</strong><small>{reason.code}</small></div><span>{reason.numeric_value !== null ? `${reason.numeric_value.toFixed(2)} ${reason.unit || ""}` : reason.text_value}</span></article>)}</div></section>
    {signal.result ? <section className="settlement-banner"><div><span>Resultado</span><strong>{signal.result.result_status.toUpperCase()}</strong></div><div><span>Marcador final</span><strong>{signal.result.home_score ?? "—"} — {signal.result.away_score ?? "—"}</strong></div><div><span>Unidades</span><strong>{units(signal.result.profit_loss_units)}</strong></div></section> : null}
    <p className="responsible-notice">{response.data?.responsible_use_notice}</p>
  </>}</AppShell>;
}
