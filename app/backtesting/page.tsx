import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getVerifiedIdentity } from "@/features/auth/lib/session";
import { BacktestForm } from "@/features/backtesting/backtest-form";

export const metadata: Metadata = { title: "Backtesting" };

export default async function BacktestingPage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/login?next=/backtesting");
  return <AppShell identity={identity} currentPath="/backtesting">
    <header className="app-page-header product-heading"><div><span className="auth-kicker">Simulación histórica</span><h1>Backtesting</h1><p>Evalúa filtros sobre señales ya liquidadas con stake fijo de una unidad.</p></div></header>
    <p className="responsible-notice">Esta herramienta no ejecuta apuestas, no garantiza resultados futuros y conserva también las pérdidas.</p>
    <BacktestForm />
  </AppShell>;
}
