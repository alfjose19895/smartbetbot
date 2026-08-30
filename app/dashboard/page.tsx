"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base font-black text-slate-950">
              ⚡
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Smart<span className="text-emerald-400">Bet</span>Bot
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-xs font-semibold sm:gap-6 sm:text-sm">
            <ThemeToggle />
            <Link href="/dashboard" className="text-emerald-400 font-bold">
              Dashboard
            </Link>
            <Link href="/signals" className="text-slate-300 transition hover:text-white">
              Picks
            </Link>
            <Link href="/history" className="text-slate-300 transition hover:text-white">
              Historial
            </Link>
            <Link href="/admin" className="text-slate-300 transition hover:text-white">
              Admin
            </Link>
          </nav>

          <button
            onClick={handleSyncPredictions}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-850 px-3 py-1.5 text-xs font-bold text-slate-200 border border-slate-700 hover:bg-slate-800 transition shadow-sm"
          >
            <span>{syncing ? "🔄" : "⚡"}</span>
            <span className="hidden sm:inline">{syncing ? "Analizando..." : "Actualizar Picks"}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Status banner */}
        {syncMessage && (
          <div className="mb-6 rounded-xl bg-emerald-950/80 border border-emerald-700/60 p-3 text-center text-xs font-bold text-emerald-300">
            {syncMessage}
          </div>
        )}

        {/* Dashboard Title & KPIs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Análisis del Día & Mañana
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Oportunidades estadísticas validadas con cálculo de probabilidad y cuota de valor
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900/80 px-3 py-2 border border-slate-800 text-center">
              <span className="text-[10px] uppercase text-slate-400 block font-medium">Picks Activos</span>
              <span className="text-base font-extrabold text-white">{filteredPredictions.length}</span>
            </div>
            <div className="rounded-xl bg-slate-900/80 px-3 py-2 border border-slate-800 text-center">
              <span className="text-[10px] uppercase text-slate-400 block font-medium">Cuota Media</span>
              <span className="text-base font-extrabold text-sky-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.odds, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(2)}
              </span>
            </div>
            <div className="rounded-xl bg-slate-900/80 px-3 py-2 border border-slate-800 text-center">
              <span className="text-[10px] uppercase text-slate-400 block font-medium">Prob. Media</span>
              <span className="text-base font-extrabold text-emerald-400">
                {(
                  filteredPredictions.reduce((acc, p) => acc + p.probability, 0) /
                  (filteredPredictions.length || 1)
                ).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/80 p-2.5">
          <span className="self-center text-xs font-bold text-slate-400 mr-2 ml-1">Fecha:</span>
          <button
            onClick={() => {
              setSelectedDate("all");
              setSelectedLeague("all");
              setSelectedMarket("all");
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "all"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
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
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
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
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
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
                : "bg-slate-950/60 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            🗓️ Esta Semana
          </button>
        </div>

        {/* League Filters */}
        <div className="mt-3 flex flex-wrap gap-2 border-y border-slate-850 py-3">
          <span className="self-center text-xs font-bold text-slate-400 mr-2">Ligas:</span>
          {leagues.map((league) => (
            <button
              key={league}
              onClick={() => setSelectedLeague(league)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedLeague === league
                  ? "bg-sky-500 text-slate-950 font-bold shadow-md"
                  : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              {league === "all" ? "Todas las Ligas" : league}
            </button>
          ))}
        </div>

        {/* Markets Filter */}
        <div className="mt-2 flex flex-wrap gap-2 pb-4">
          <span className="self-center text-xs font-bold text-slate-400 mr-2">Mercados:</span>
          {markets.map((market) => (
            <button
              key={market}
              onClick={() => setSelectedMarket(market)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                selectedMarket === market
                  ? "bg-emerald-400 text-slate-950 font-bold"
                  : "bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800/60"
              }`}
            >
              {market === "all" ? "Todos los Mercados" : market}
            </button>
          ))}
        </div>

        {/* Cards Grid */}
        {loading ? (
          <div className="mt-16 text-center text-slate-400">
            <span className="inline-block animate-spin text-3xl">⏳</span>
            <p className="mt-3 text-sm">Cargando pronósticos de hoy y mañana...</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="mt-16 rounded-2xl bg-slate-900/40 p-12 text-center border border-slate-800">
            <p className="text-base text-slate-400">No hay picks que coincidan con estos filtros de fecha/liga.</p>
            <button
              onClick={() => {
                setSelectedDate("all");
                setSelectedLeague("all");
                setSelectedMarket("all");
              }}
              className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              Ver Todos los Pronósticos
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPredictions.map((prediction) => (
              <PredictionCard key={prediction.id || prediction.fixtureId} prediction={prediction} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
