"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { FeaturedDailyPicks } from "@/components/FeaturedDailyPicks";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity, getFeaturedDailyPicks } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";

export default function FeaturedPicksPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/signals");
      const json = await res.json();
      if (json.signals) {
        setSignals(json.signals);
      }
    } catch (err) {
      console.error("Error fetching signals for featured page:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, []);

  const { smartPick, bombaPick } = getFeaturedDailyPicks(signals);

  const now = new Date();
  const formattedDate = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-50">
      <Navbar onSync={fetchSignals} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Page Hero Header */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 p-6 sm:p-10 shadow-2xl text-white">
          <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300 border border-amber-500/40">
              <span>👑</span>
              <span>Módulo Insignia • SmartBetBot Flagship</span>
            </div>

            <h1 className="mt-3 text-2xl sm:text-4xl font-black tracking-tight text-white">
              Picks Destacados del Día
            </h1>

            <p className="mt-2 text-sm sm:text-base text-slate-300 font-medium leading-relaxed">
              Selección algorítmica de máxima convicción: el <strong className="text-amber-400 font-bold">SmartPick</strong> para apostar con la más alta seguridad estadística y la <strong className="text-rose-400 font-bold">Bomba</strong> para maximizar rendimiento con cuotas de alto valor positivo (+EV).
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5 rounded-xl bg-slate-800/80 px-3 py-1.5 border border-slate-700/80">
                <span>📅</span>
                <span className="capitalize">{formattedDate}</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-xl bg-emerald-950/80 px-3 py-1.5 text-emerald-300 border border-emerald-700/80">
                <span>🛡️</span>
                <span>Filtro Poisson & Elo</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-xl bg-amber-950/80 px-3 py-1.5 text-amber-300 border border-amber-700/80">
                <span>🎯</span>
                <span>Cuotas Auténticas de Bookmakers</span>
              </span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent shadow-lg" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
              Analizando candidatos cuantitativos para el SmartPick y la Bomba...
            </p>
          </div>
        ) : !smartPick && !bombaPick ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-4xl">⏳</div>
            <h3 className="mt-3 text-lg font-black text-slate-800 dark:text-white">
              Generando los Picks Destacados
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              El motor está procesando la cartelera deportiva. Haz clic en actualizar para verificar nuevos partidos.
            </p>
            <button
              onClick={fetchSignals}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 cursor-pointer"
            >
              <span>🔄</span>
              <span>Actualizar Pronósticos</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Main Featured Component */}
            <FeaturedDailyPicks
              smartPick={smartPick}
              bombaPick={bombaPick}
              onOpenDetail={(pick) => setActiveModalPick(pick)}
            />

            {/* Strategic Comparison & Bankroll Guidance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SmartPick Strategic Guide */}
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-black text-base">
                  <span>👑</span>
                  <span>Estrategia: SmartPick del Día</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                  Es el pronóstico con el <strong>SmartScore más elevado</strong> de toda la jornada (habitualmente &gt;90/100). Diseñado como la apuesta ancla o jugada principal del día con altísima tasa de acierto proyectada (&ge;85-92%).
                </p>
                <div className="rounded-2xl bg-white/80 p-3.5 border border-emerald-200/80 text-xs font-bold text-emerald-900 dark:bg-slate-900/80 dark:border-emerald-800/60 dark:text-emerald-300 flex items-center justify-between">
                  <span>💼 Gestión de Bankroll:</span>
                  <span className="rounded-lg bg-emerald-100 px-2.5 py-1 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-extrabold">
                    Stake 3 - 5% (Fuerte)
                  </span>
                </div>
              </div>

              {/* Bomba Strategic Guide */}
              <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/20 space-y-3">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-400 font-black text-base">
                  <span>💣</span>
                  <span>Estrategia: Bomba del Día</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                  Seleccionada por su <strong>alto rendimiento y cuota superior</strong> (@2.00 o más). El modelo detecta una discrepancia matemática relevante frente a la casa de apuestas con un Valor Esperado positivo (+EV).
                </p>
                <div className="rounded-2xl bg-white/80 p-3.5 border border-rose-200/80 text-xs font-bold text-rose-900 dark:bg-slate-900/80 dark:border-rose-800/60 dark:text-rose-300 flex items-center justify-between">
                  <span>💼 Gestión de Bankroll:</span>
                  <span className="rounded-lg bg-rose-100 px-2.5 py-1 dark:bg-rose-900 text-rose-800 dark:text-rose-200 font-extrabold">
                    Stake 1 - 2% (Moderado)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Links Navigation Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                ¿Deseas explorar toda la cartelera completa o el Parley del Día?
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/signals"
                  className="rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition"
                >
                  🎯 Ver Alertas del Día
                </Link>
                <Link
                  href="/parlay"
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition"
                >
                  🔥 Ver Parley del Día
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Match Detail Modal for in-depth stats & H2H */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
    </div>
  );
}
