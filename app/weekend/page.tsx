"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { WeekendExclusiveModule } from "@/components/WeekendExclusiveModule";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import Link from "next/link";

export default function WeekendExclusivePage() {
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8">
          {/* Main Weekend Exclusive Module */}
          <WeekendExclusiveModule
            onOpenDetail={(pick) => setActiveModalPick(pick)}
            showBackLink={true}
          />

          {/* Quick Navigation Footer Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
            <div className="text-xs text-slate-400 font-medium">
              Explora también nuestras otras carteleras especializadas y análisis cuantitativo:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/featured"
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                ⭐ Destacados 5 Estrellas
              </Link>
              <Link
                href="/signals"
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
              >
                📋 Cartelera Completa Pre-Match
              </Link>
              <Link
                href="/parlay"
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition"
              >
                🔥 Parley del Día
              </Link>
            </div>
          </div>
        </main>
      </div>

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
    </div>
  );
}
