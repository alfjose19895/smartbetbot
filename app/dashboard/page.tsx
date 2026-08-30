"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

export default function DashboardPage() {
  const [predictions, setPredictions] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Filters
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [selectedMarket, setSelectedMarket] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week">("all");

  const loadSignals = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/signals");
      const json = await res.json();
      if (json.signals) {
        setPredictions(json.signals);
      }
    } catch (err) {
      console.error("Error loading signals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const handleSyncPredictions = async () => {
    try {
      setSyncing(true);
      setSyncMessage(null);
      const res = await fetch("/api/admin/sync/predictions", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSyncMessage(`⚡ Pronósticos sincronizados: ${json.count} oportunidades.`);
        await loadSignals();
      } else {
        setSyncMessage("⚠️ No se pudo completar la sincronización en vivo.");
      }
    } catch {
      setSyncMessage("⚠️ Error de conexión con el motor de análisis.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // Extract unique active leagues and markets
  const leagues = ["all", ...Array.from(new Set(predictions.map((p) => p.league).filter(Boolean)))];
  const markets = ["all", ...Array.from(new Set(predictions.map((p) => p.market).filter(Boolean)))];

  // Precise Local Calendar Day Filtering
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowDay = todayDay + 86400000;
  const weekEndDay = todayDay + 7 * 86400000;

  const filteredPredictions = predictions.filter((p) => {
    // 1. Date filter
    if (selectedDate === "today") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== todayDay) return false;
    } else if (selectedDate === "tomorrow") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== tomorrowDay) return false;
    } else if (selectedDate === "week") {
      const d = new Date(p.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay < todayDay || matchDay > weekEndDay) return false;
    }

    // 2. League filter
    if (selectedLeague !== "all" && p.league !== selectedLeague) {
      return false;
    }

    // 3. Market filter
    if (selectedMarket !== "all" && p.market !== selectedMarket) {
      return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Top Navbar */}
      <Navbar onSync={handleSyncPredictions} syncing={syncing} />

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Status banner */}
        {syncMessage && (
          <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-300 p-3 text-center text-xs font-bold text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700/60 dark:text-emerald-300">
            {syncMessage}
          </div>
        )}

        {/* Dashboard Title & KPIs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Análisis del Día & Mañana
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              Oportunidades estadísticas validadas con cálculo de probabilidad y cuota de valor
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white px-4 py-2.5 border border-slate-200/90 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">Picks Activos</span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">{filteredPredictions.length}</span>
            </div>
            <div className="rounded-2xl bg-white px-4 py-2.5 border border-slate-200/90 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">Cuota Media</span>
              <span className="text-base font-extrabold text-sky-600 dark:text-sky-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.odds, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(2)}
              </span>
            </div>
            <div className="rounded-2xl bg-white px-4 py-2.5 border border-slate-200/90 text-center shadow-sm dark:bg-slate-900/80 dark:border-slate-800">
              <span className="text-[10px] uppercase text-slate-500 block font-semibold dark:text-slate-400">Prob. Media</span>
              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.probability, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <span className="self-center text-xs font-bold text-slate-500 mr-2 ml-1 dark:text-slate-400">Fecha:</span>
          <button
            onClick={() => {
              setSelectedDate("all");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "all"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🌟 Todos los Días ({predictions.length})
          </button>
          <button
            onClick={() => {
              setSelectedDate("today");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "today"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            📅 Hoy
          </button>
          <button
            onClick={() => {
              setSelectedDate("tomorrow");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "tomorrow"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🔥 Mañana
          </button>
          <button
            onClick={() => {
              setSelectedDate("week");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "week"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🗓️ Esta Semana
          </button>
        </div>

        {/* League Filters */}
        <div className="mt-3 flex flex-wrap gap-2 border-y border-slate-200 py-3 dark:border-slate-800">
          <span className="self-center text-xs font-bold text-slate-500 mr-2 dark:text-slate-400">Ligas:</span>
          {leagues.map((league) => (
            <button
              key={league}
              onClick={() => setSelectedLeague(league)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedLeague === league
                  ? "bg-sky-600 text-white font-bold shadow-sm dark:bg-sky-500 dark:text-slate-950"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
              }`}
            >
              {league === "all" ? "Todas las Ligas" : league}
            </button>
          ))}
        </div>

        {/* Market Filters */}
        <div className="mt-3 flex flex-wrap gap-2 pb-4">
          <span className="self-center text-xs font-bold text-slate-500 mr-2 dark:text-slate-400">Mercados:</span>
          {markets.map((market) => (
            <button
              key={market}
              onClick={() => setSelectedMarket(market)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedMarket === market
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
              }`}
            >
              {market === "all" ? "Todos los Mercados" : market}
            </button>
          ))}
        </div>

        {/* Grid of Prediction Cards */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando pronósticos calculados...</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">No hay partidos para este filtro</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Prueba seleccionando &quot;🌟 Todos los Días&quot; o cambiando la liga seleccionada.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPredictions.map((pred) => (
              <PredictionCard key={pred.id || pred.fixtureId} prediction={pred} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
