"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { DestacadosModule } from "@/components/DestacadosModule";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
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
      const res = await fetch(`/api/signals?sport=football&_t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      if (Array.isArray(json.signals)) {
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950 flex flex-col justify-between">
      <div>
        <Navbar onSync={fetchSignals} />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-8">
          {/* Main Destacados 5-Stars Module */}
          <DestacadosModule
            predictions={signals}
            loading={loading}
            onOpenDetail={(pick) => setActiveModalPick(pick)}
            onRefresh={fetchSignals}
            showBackLink={true}
          />

          {/* Quick Links Navigation Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
            <div className="text-xs text-slate-400 font-medium">
              ¿Deseas explorar toda la cartelera completa o el Parley del Día?
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/signals"
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
              >
                🎯 Ver Todas las Alertas de Fútbol
              </Link>
              <Link
                href="/parlay"
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md hover:brightness-110 transition"
              >
                🔥 Ver Parley del Día
              </Link>
            </div>
          </div>
        </main>
      </div>

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
