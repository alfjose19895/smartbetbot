import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { getFallbackFeaturedPredictions } from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export default function HomePage() {
  const featuredPicks: MarketOpportunity[] = getFallbackFeaturedPredictions().slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3.5 py-3.5 sm:px-6 sm:py-4 lg:px-8 gap-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 mr-auto shrink-0 pr-2">
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base sm:text-lg font-black text-slate-950 shadow-lg shadow-emerald-500/20">
              ⚡
            </span>
            <span className="text-lg sm:text-xl font-black tracking-tight text-white leading-none">
              Smart<span className="text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <Link href="/dashboard" className="transition hover:text-emerald-400">
              Dashboard
            </Link>
            <Link href="/signals" className="transition hover:text-emerald-400">
              Picks de Hoy
            </Link>
            <Link href="/history" className="transition hover:text-emerald-400">
              Historial
            </Link>
            <Link href="/admin" className="transition hover:text-emerald-400">
              Admin Sync
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden sm:inline-flex rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-300 transition hover:text-white"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 hover:scale-[1.02]"
            >
              <span>Ver Picks</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />
        
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Análisis Matemático & IA para Apuestas Deportivas</span>
          </div>

          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.15]">
            Pronósticos claros con{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Probabilidad & Valor Real
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-400 sm:text-lg">
            SmartBetBot evalúa cientos de partidos diarios con modelos Poisson y métricas ofensivas.
            Sin complicaciones: encuentra cuotas con valor y compártelas al instante.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-extrabold text-slate-950 shadow-xl shadow-emerald-500/25 transition hover:bg-emerald-400 hover:scale-105"
            >
              <span>🚀 Entrar al Dashboard</span>
            </Link>
            <Link
              href="/signals"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-6 py-3.5 text-base font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              <span>Ver Picks de Hoy</span>
            </Link>
          </div>

          {/* Quick Metrics Banner */}
          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur-sm sm:p-6">
            <div>
              <p className="text-2xl font-black text-white sm:text-3xl">72.4%</p>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">Tasa de Acierto</p>
            </div>
            <div className="border-x border-slate-800">
              <p className="text-2xl font-black text-emerald-400 sm:text-3xl">+14.2%</p>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">Yield Promedio</p>
            </div>
            <div>
              <p className="text-2xl font-black text-sky-400 sm:text-3xl">1.68</p>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">Cuota Promedio</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Prediction Cards Showcase */}
      <section className="border-t border-slate-900 bg-slate-950/80 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Análisis Destacados de Hoy
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Tarjetas diseñadas para consumir rápidamente y compartir en tus canales o historias
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredPicks.map((pick: MarketOpportunity) => (
              <PredictionCard key={pick.id || pick.fixtureId} prediction={pick} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/signals"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-emerald-400 border border-slate-800 transition hover:bg-slate-850 hover:border-emerald-500/50"
            >
              <span>Ver Todos los Análisis Disponibles</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} SmartBetBot — Análisis estadístico deportivo.</p>
          <div className="flex gap-4">
            <Link href="/responsible-gambling" className="hover:text-slate-400">
              Juego Responsable
            </Link>
            <Link href="/dashboard" className="hover:text-slate-400">
              Dashboard
            </Link>
            <Link href="/admin" className="hover:text-slate-400">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
