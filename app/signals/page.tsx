"use client";

import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PredictionCard } from "@/components/PredictionCard";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES } from "@/lib/sports/api-football";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

export default function SignalsPage() {
  const [signals, setSignals] = useState<MarketOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [minProbability, setMinProbability] = useState<number>(60);
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "tomorrow" | "week">("all");

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/signals");
        const json = await res.json();
        if (json.signals) {
          setSignals(json.signals);
        }
      } catch (err) {
        console.error("Error fetching signals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, []);

  const availableLeagueNames = Array.from(new Set([...signals.map((s) => s.league).filter(Boolean), ...SUPPORTED_LEAGUES.map((l) => l.name)]));
  const leagues = ["all", ...availableLeagueNames];

  // Precise Local Calendar Day Filtering
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowDay = todayDay + 86400000;
  const weekEndDay = todayDay + 7 * 86400000;

  const filteredSignals = signals.filter((s) => {
    if (s.probability < minProbability) return false;
    if (selectedLeagues.length > 0 && !selectedLeagues.includes(s.league)) return false;

    if (selectedDate === "today") {
      const d = new Date(s.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== todayDay) return false;
    } else if (selectedDate === "tomorrow") {
      const d = new Date(s.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay !== tomorrowDay) return false;
    } else if (selectedDate === "week") {
      const d = new Date(s.kickoff);
      const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (matchDay < todayDay || matchDay > weekEndDay) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      {/* Header */}
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Picks Deportivos con Mayor Probabilidad
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Filtra por fecha, probabilidad mínima o liga para encontrar las mejores oportunidades del día
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <span className="self-center text-xs font-bold text-slate-500 mr-2 ml-1 dark:text-slate-400">Fecha:</span>
          <button
            onClick={() => setSelectedDate("all")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "all"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🌟 Todos los Días ({signals.length})
          </button>
          <button
            onClick={() => setSelectedDate("today")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "today"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            📅 Hoy
          </button>
          <button
            onClick={() => setSelectedDate("tomorrow")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "tomorrow"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🔥 Mañana
          </button>
          <button
            onClick={() => setSelectedDate("week")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedDate === "week"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-800"
            }`}
          >
            🗓️ Esta Semana
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Probabilidad Mínima:</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="85"
                step="5"
                value={minProbability}
                onChange={(e) => setMinProbability(Number(e.target.value))}
                className="h-2 w-32 cursor-pointer accent-emerald-500"
              />
              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                {minProbability}%
              </span>
            </div>
          </div>

          <MultiSelectDropdown
            label="Ligas"
            icon="🏆"
            options={availableLeagueNames}
            selected={selectedLeagues}
            onChange={setSelectedLeagues}
            placeholderAll="Todas las Ligas"
          />
        </div>

        {/* Signals List */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold">Cargando pronósticos...</p>
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Sin resultados</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ajusta el slider de probabilidad o selecciona otra liga.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSignals.map((signal) => (
              <PredictionCard key={signal.id || signal.fixtureId} prediction={signal} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
