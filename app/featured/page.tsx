"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { DestacadosModule } from "@/components/DestacadosModule";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { VipDateFilter } from "@/components/VipDateFilter";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";

function getEcuadorDate(offsetDays: number = 0): string {
  try {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(target);
  } catch {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    return target.toISOString().split("T")[0];
  }
}

export default function FeaturedPicksPage() {
  const { language } = useLanguage();
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => getEcuadorDate(0));

  const fetchSignals = async (targetDate?: string) => {
    try {
      setLoading(true);
      const queryDate = targetDate || selectedDate;
      const res = await fetch(`/api/signals?sport=football&date=${queryDate}&_t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      if (Array.isArray(json.signals)) {
        setSignals(json.signals);
      } else {
        setSignals([]);
      }
    } catch (err) {
      console.error("Error fetching signals for featured page:", err);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals(selectedDate);
  }, [selectedDate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950 flex flex-col justify-between">
      <div>
        <Navbar onSync={() => fetchSignals(selectedDate)} />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          {/* Header & Date Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                ⭐ Cartelera Destacados:
              </span>
              <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                {selectedDate === getEcuadorDate(0)
                  ? `🟢 Hoy (${selectedDate})`
                  : selectedDate === getEcuadorDate(-1)
                  ? `Ayer (${selectedDate})`
                  : `Historial (${selectedDate})`}
              </span>
            </div>
            <VipDateFilter
              selectedDate={selectedDate}
              onDateChange={(date) => {
                setSelectedDate(date);
                fetchSignals(date);
              }}
              loading={loading}
            />
          </div>

          {/* Main Destacados 5-Stars Module */}
          <DestacadosModule
            predictions={signals}
            loading={loading}
            onOpenDetail={(pick) => setActiveModalPick(pick)}
            onRefresh={() => fetchSignals(selectedDate)}
            showBackLink={true}
            titleSuffix={selectedDate !== getEcuadorDate(0) ? `(${selectedDate})` : ""}
          />

          {/* Quick Links Navigation Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
            <div className="text-xs text-slate-400 font-medium">
              ¿Deseas explorar la cartelera exclusiva de fin de semana o el Parley del Día?
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/weekend"
                className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition"
              >
                💎 Exclusivas Fin de Semana (15 Picks)
              </Link>
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
